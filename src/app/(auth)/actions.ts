'use server';

import { createClient, createAdminClient, createIsolatedAuthClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { generateParentCode, normalizePhone } from '@/lib/utils';

export type AuthResult = {
  success: boolean;
  error?: string;
  data?: {
    parentCode?: string;
    studentName?: string;
    studentId?: string;
    /** 실패 후 클라이언트에서 라우팅할 경로 (예: 퇴원 회원 안내 페이지). */
    redirect?: string;
    /** 비밀번호 찾기: OTP 검증으로 발급된 recovery 세션 토큰. 마지막 단계에서 setSession에 사용. */
    recoveryAccessToken?: string;
    recoveryRefreshToken?: string;
  };
};

/**
 * 학생 회원가입
 */
export async function signUpStudent(formData: FormData): Promise<AuthResult> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const name = formData.get('name') as string;
  const phone = formData.get('phone') as string;
  const school = formData.get('school') as string;
  const branchId = formData.get('branchId') as string;
  const studentTypeId = formData.get('studentTypeId') as string;

  if (!email || !password || !name || !phone || !school || !branchId || !studentTypeId) {
    return {
      success: false,
      error: '필수 항목을 모두 입력해주세요. (이메일, 비밀번호, 이름, 전화번호, 학교, 지점, 학년)',
    };
  }

  const supabaseAdmin = createAdminClient();

  // 0. 재가입 중복 차단 — 동일 이름+전화번호의 학생이 이미 있으면 새 프로필을 만들지 않는다.
  //    퇴원 학생이면 새 계정 대신 관리자 복구를, 활성 학생이면 로그인을 안내.
  //    auth user 생성 전에 검사(고아 계정 방지). 이름이 같은 학생만 조회 후 전화번호 정규화 비교.
  //    한계: 전화번호까지 바꿔 재가입하면 일반 신규와 구분 불가(수용).
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) {
    const { data: sameNameStudents } = await supabaseAdmin
      .from('profiles')
      .select('phone, withdrawn_at')
      .eq('user_type', 'student')
      .eq('name', name);
    const match = (sameNameStudents ?? []).find(
      (p) => normalizePhone((p as { phone: string | null }).phone) === normalizedPhone,
    );
    if (match) {
      const withdrawn = (match as { withdrawn_at: string | null }).withdrawn_at != null;
      return {
        success: false,
        error: withdrawn
          ? '이전에 가입한 이력이 있습니다. 재가입 대신 관리자에게 계정 복구를 요청해 주세요.'
          : '이미 가입된 계정이 있습니다. 로그인해 주세요.',
      };
    }
  }

  // 1. Supabase Auth로 사용자 생성 (Admin 클라이언트 사용)
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    if (
      authError.message.includes('already registered') ||
      authError.message.includes('already been registered')
    ) {
      return { success: false, error: '이미 등록된 이메일입니다.' };
    }
    return { success: false, error: authError.message };
  }

  if (!authData.user) {
    return { success: false, error: '회원가입에 실패했습니다.' };
  }

  const userId = authData.user.id;

  // 2. profiles 테이블에 기본 정보 저장 (Admin 클라이언트로 RLS 우회)
  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    id: userId,
    email,
    name,
    phone: phone || null,
    school: school || null,
    user_type: 'student',
    branch_id: branchId,
  });

  if (profileError) {
    return { success: false, error: '프로필 생성에 실패했습니다: ' + profileError.message };
  }

  // 3. 학부모 연결 코드 생성
  const parentCode = generateParentCode();

  // 4. student_profiles 테이블에 학생 정보 저장 (Admin 클라이언트로 RLS 우회)
  const { error: studentError } = await supabaseAdmin.from('student_profiles').insert({
    id: userId,
    parent_code: parentCode,
    student_type_id: studentTypeId,
  });

  if (studentError) {
    return { success: false, error: '학생 프로필 생성에 실패했습니다: ' + studentError.message };
  }

  // 5. 채팅방 자동 생성
  const { error: chatRoomError } = await supabaseAdmin
    .from('chat_rooms')
    .insert({ student_id: userId });

  if (chatRoomError) {
    console.error('채팅방 자동 생성 실패:', chatRoomError.message);
  }

  return {
    success: true,
    data: { parentCode },
  };
}

/**
 * 학부모 회원가입 (여러 자녀 연결 코드 지원)
 */
export async function signUpParent(formData: FormData): Promise<AuthResult> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const name = formData.get('name') as string;
  const phone = formData.get('phone') as string;
  const parentCodesJson = formData.get('parentCodes') as string;

  if (!email || !password || !name || !phone || !parentCodesJson) {
    return { success: false, error: '필수 항목을 모두 입력해주세요. (전화번호 포함)' };
  }

  let parentCodes: string[];
  try {
    parentCodes = JSON.parse(parentCodesJson);
    if (!Array.isArray(parentCodes) || parentCodes.length === 0) {
      return { success: false, error: '최소 하나의 연결 코드가 필요합니다.' };
    }
  } catch {
    return { success: false, error: '연결 코드 형식이 올바르지 않습니다.' };
  }

  const supabaseAdmin = createAdminClient();

  // 0. 동일인(전화번호) 중복 학부모 계정 차단 — auth user 생성 전에 검사(고아 계정 방지).
  //    부/모가 서로 다른 번호로 각각 가입하는 것은 허용(번호가 다르면 통과).
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) {
    const { data: existingParents } = await supabaseAdmin
      .from('profiles')
      .select('phone')
      .eq('user_type', 'parent')
      .is('withdrawn_at', null);
    const dup = (existingParents ?? []).some(
      (p) => normalizePhone((p as { phone: string | null }).phone) === normalizedPhone,
    );
    if (dup) {
      return {
        success: false,
        error: '이미 가입된 학부모 계정이 있습니다. 로그인 후 자녀를 추가해 주세요.',
      };
    }
  }

  // 1. 모든 학생 연결 코드 검증 (Admin 클라이언트로 RLS 우회) — 퇴원 학생은 매칭 거부
  const studentIds: string[] = [];
  for (const code of parentCodes) {
    const { data: studentData, error: verifyError } = await supabaseAdmin
      .from('student_profiles')
      .select('id, profiles!inner(withdrawn_at)')
      .eq('parent_code', code)
      .maybeSingle();

    const studentWithdrawnAt = (
      studentData?.profiles as unknown as { withdrawn_at: string | null } | undefined
    )?.withdrawn_at;

    if (verifyError || !studentData || studentWithdrawnAt) {
      return { success: false, error: `유효하지 않은 연결 코드입니다: ${code}` };
    }
    studentIds.push(studentData.id);
  }

  // 2. Supabase Auth로 사용자 생성 (Admin 클라이언트 사용)
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    if (
      authError.message.includes('already registered') ||
      authError.message.includes('already been registered')
    ) {
      return { success: false, error: '이미 등록된 이메일입니다.' };
    }
    return { success: false, error: authError.message };
  }

  if (!authData.user) {
    return { success: false, error: '회원가입에 실패했습니다.' };
  }

  const userId = authData.user.id;

  // 3. profiles 테이블에 기본 정보 저장 (Admin 클라이언트로 RLS 우회)
  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    id: userId,
    email,
    name,
    phone: phone || null,
    user_type: 'parent',
  });

  if (profileError) {
    return { success: false, error: '프로필 생성에 실패했습니다: ' + profileError.message };
  }

  // 4. parent_profiles 테이블에 학부모 정보 저장 (Admin 클라이언트로 RLS 우회)
  const { error: parentError } = await supabaseAdmin.from('parent_profiles').insert({
    id: userId,
  });

  if (parentError) {
    return { success: false, error: '학부모 프로필 생성에 실패했습니다: ' + parentError.message };
  }

  // 5. parent_student_links 테이블에 자녀 연결 정보 저장 (Admin 클라이언트로 RLS 우회)
  const linkInserts = studentIds.map((studentId) => ({
    parent_id: userId,
    student_id: studentId,
  }));

  const { error: linkError } = await supabaseAdmin.from('parent_student_links').insert(linkInserts);

  if (linkError) {
    return { success: false, error: '자녀 연결에 실패했습니다: ' + linkError.message };
  }

  return { success: true };
}

/**
 * 로그인
 */
export async function signIn(formData: FormData): Promise<AuthResult> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { success: false, error: '이메일과 비밀번호를 입력해주세요.' };
  }

  const supabase = await createClient();

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // 어드민이 ban_duration 으로 차단한 계정 (퇴원 처리). 사용자가 사유를 알 수 있도록
      // 안내 페이지로 라우팅 신호를 함께 보낸다.
      const errCode = (error as { code?: string }).code;
      if (errCode === 'user_banned' || /banned/i.test(error.message)) {
        return {
          success: false,
          error: '비활성화된 계정입니다.',
          data: { redirect: '/account/withdrawn' },
        };
      }
      if (error.message.includes('Invalid login credentials')) {
        return { success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch {
    return { success: false, error: '로그인 중 오류가 발생했습니다.' };
  }
}

/**
 * 로그아웃
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 자동로그인 선택값 정리. 다음 로그인에서 기본값(ON)으로 재선택될 수 있게 한다.
  // path를 명시하지 않으면 호출 URL 기준의 path로 삭제되어, 이전 ON 로그인 시
  // 클라이언트가 Path=/로 set한 영구쿠키를 못 지우는 케이스가 생긴다.
  const store = await cookies();
  store.set('wstudy_remember', '', { path: '/', maxAge: 0 });
  redirect('/login');
}

/**
 * 비밀번호 재설정 이메일 발송 (6자리 OTP 코드)
 */
export async function resetPassword(formData: FormData): Promise<AuthResult> {
  const email = formData.get('email') as string;

  if (!email) {
    return { success: false, error: '이메일을 입력해주세요.' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    const msg = error.message;
    // Supabase가 반환하는 영어 에러를 한국어로 변환한다.
    if (/rate limit/i.test(msg) || /only request this after/i.test(msg)) {
      return {
        success: false,
        error: '잠시 후 다시 시도해주세요. 잠깐 동안만 재요청이 제한됩니다.',
      };
    }
    if (/invalid format/i.test(msg) || /Unable to validate email/i.test(msg)) {
      return { success: false, error: '올바른 이메일 형식이 아닙니다.' };
    }
    return { success: false, error: '이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.' };
  }

  return { success: true };
}

/**
 * 비밀번호 재설정 OTP 코드 검증 (OTP 단계에서 즉시 검증)
 *
 * 쿠키 비바인딩 격리 클라이언트로 verifyOtp를 실행하므로 브라우저에 recovery 세션 쿠키가
 * 생성되지 않는다(미들웨어 리다이렉트 충돌 방지). 검증으로 발급된 recovery 세션 토큰을
 * 반환값으로 클라이언트에 전달하고, 마지막 비밀번호 설정 단계에서 setSession으로 복원해 사용한다.
 */
export async function verifyResetCode(email: string, token: string): Promise<AuthResult> {
  if (!email || !token) {
    return { success: false, error: '이메일과 인증 코드를 입력해주세요.' };
  }

  const client = createIsolatedAuthClient();

  const { data, error } = await client.auth.verifyOtp({
    email,
    token,
    type: 'recovery',
  });

  if (error) {
    if (error.message.includes('expired')) {
      return { success: false, error: '인증 코드가 만료되었습니다. 다시 요청해주세요.' };
    }
    return { success: false, error: '인증 코드가 올바르지 않습니다.' };
  }

  // verifyOtp 성공이지만 세션이 비어 있는 경우 방어 (정상 recovery 흐름에선 발생하지 않음)
  if (!data.session) {
    return { success: false, error: '인증에 실패했습니다. 다시 시도해주세요.' };
  }

  return {
    success: true,
    data: {
      recoveryAccessToken: data.session.access_token,
      recoveryRefreshToken: data.session.refresh_token,
    },
  };
}

/**
 * OTP 인증 후 새 비밀번호 설정
 *
 * verifyResetCode가 발급한 recovery 토큰을 받아 격리 클라이언트에 setSession으로 복원한 뒤
 * 같은 인스턴스로 updateUser를 호출한다. 쿠키 바인딩 클라이언트를 쓰지 않으므로 본 세션을
 * 만들지 않고(따라서 signOut도 불필요), 사용자는 끝까지 비로그인 상태를 유지한다.
 */
export async function resetUpdatePassword(
  newPassword: string,
  accessToken: string,
  refreshToken: string,
): Promise<AuthResult> {
  if (!newPassword) {
    return { success: false, error: '새 비밀번호를 입력해주세요.' };
  }

  if (newPassword.length < 6) {
    return { success: false, error: '비밀번호는 6자 이상이어야 합니다.' };
  }

  if (!accessToken || !refreshToken) {
    return { success: false, error: '인증 정보가 만료되었습니다. 처음부터 다시 시도해주세요.' };
  }

  const client = createIsolatedAuthClient();

  const { error: sessionError } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError) {
    return { success: false, error: '인증 정보가 만료되었습니다. 처음부터 다시 시도해주세요.' };
  }

  const { error } = await client.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    const msg = error.message;
    // Supabase가 반환하는 영어 에러를 한국어로 변환한다.
    if (/should be different from the old password/i.test(msg)) {
      return { success: false, error: '기존 비밀번호와 다른 비밀번호를 입력해주세요.' };
    }
    if (/at least 6 characters/i.test(msg) || /Password should be at least/i.test(msg)) {
      return { success: false, error: '비밀번호는 6자 이상이어야 합니다.' };
    }
    if (/weak/i.test(msg) || /password is too/i.test(msg)) {
      return { success: false, error: '비밀번호가 너무 단순합니다. 다른 비밀번호를 입력해주세요.' };
    }
    if (/expired/i.test(msg) || /invalid/i.test(msg)) {
      return { success: false, error: '인증 정보가 만료되었습니다. 처음부터 다시 시도해주세요.' };
    }
    return { success: false, error: '비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해주세요.' };
  }

  return { success: true };
}

/**
 * 학부모 연결 코드 검증
 */
export async function verifyParentCode(code: string): Promise<AuthResult> {
  if (!code) {
    return { success: false, error: '연결 코드를 입력해주세요.' };
  }

  // 회원가입 전(비로그인) 호출이므로 RLS를 우회하는 admin 클라이언트 사용.
  // signUpParent의 검증 경로와 동일한 권한으로 맞춘다.
  const supabase = createAdminClient();

  // student_profiles에서 코드로 학생 찾기 — 퇴원 학생은 매칭 거부
  const { data: studentProfile, error: studentError } = await supabase
    .from('student_profiles')
    .select('id, profiles!inner(withdrawn_at)')
    .eq('parent_code', code)
    .maybeSingle();

  const studentWithdrawnAt = (
    studentProfile?.profiles as unknown as { withdrawn_at: string | null } | undefined
  )?.withdrawn_at;

  if (studentError || !studentProfile || studentWithdrawnAt) {
    return { success: false, error: '유효하지 않은 연결 코드입니다.' };
  }

  // profiles에서 학생 이름 가져오기
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', studentProfile.id)
    .single();

  if (profileError || !profile) {
    return { success: false, error: '학생 정보를 찾을 수 없습니다.' };
  }

  return {
    success: true,
    data: {
      studentName: profile.name,
      studentId: studentProfile.id,
    },
  };
}

/**
 * 현재 사용자의 프로필 정보 조회
 */
export async function getCurrentUserProfile() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

  return profile;
}
