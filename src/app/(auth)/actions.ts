'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { generateParentCode } from '@/lib/utils';

export type AuthResult = {
  success: boolean;
  error?: string;
  data?: {
    parentCode?: string;
    studentName?: string;
    studentId?: string;
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
  const seatNumber = formData.get('seatNumber') as string;
  const birthday = formData.get('birthday') as string;
  const branchId = formData.get('branchId') as string;

  if (!email || !password || !name || !birthday || !branchId) {
    return { success: false, error: '필수 항목을 모두 입력해주세요.' };
  }

  const supabase = await createClient();

  // 1. Supabase Auth로 사용자 생성
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) {
    if (authError.message.includes('already registered')) {
      return { success: false, error: '이미 등록된 이메일입니다.' };
    }
    return { success: false, error: authError.message };
  }

  if (!authData.user) {
    return { success: false, error: '회원가입에 실패했습니다.' };
  }

  const userId = authData.user.id;

  // 2. profiles 테이블에 기본 정보 저장
  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    email,
    name,
    phone: phone || null,
    user_type: 'student',
    branch_id: branchId,
  });

  if (profileError) {
    return { success: false, error: '프로필 생성에 실패했습니다: ' + profileError.message };
  }

  // 3. 학부모 연결 코드 생성
  const parentCode = generateParentCode();

  // 4. student_profiles 테이블에 학생 정보 저장
  const { error: studentError } = await supabase.from('student_profiles').insert({
    id: userId,
    seat_number: seatNumber ? parseInt(seatNumber, 10) : null,
    parent_code: parentCode,
    birthday: birthday,
  });

  if (studentError) {
    return { success: false, error: '학생 프로필 생성에 실패했습니다: ' + studentError.message };
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

  if (!email || !password || !name || !parentCodesJson) {
    return { success: false, error: '필수 항목을 모두 입력해주세요.' };
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

  const supabase = await createClient();

  // 1. 모든 학생 연결 코드 검증
  const studentIds: string[] = [];
  for (const code of parentCodes) {
    const { data: studentData, error: verifyError } = await supabase
      .from('student_profiles')
      .select('id')
      .eq('parent_code', code)
      .single();

    if (verifyError || !studentData) {
      return { success: false, error: `유효하지 않은 연결 코드입니다: ${code}` };
    }
    studentIds.push(studentData.id);
  }

  // 2. Supabase Auth로 사용자 생성
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) {
    if (authError.message.includes('already registered')) {
      return { success: false, error: '이미 등록된 이메일입니다.' };
    }
    return { success: false, error: authError.message };
  }

  if (!authData.user) {
    return { success: false, error: '회원가입에 실패했습니다.' };
  }

  const userId = authData.user.id;

  // 3. profiles 테이블에 기본 정보 저장
  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    email,
    name,
    phone: phone || null,
    user_type: 'parent',
  });

  if (profileError) {
    return { success: false, error: '프로필 생성에 실패했습니다: ' + profileError.message };
  }

  // 4. parent_profiles 테이블에 학부모 정보 저장
  const { error: parentError } = await supabase.from('parent_profiles').insert({
    id: userId,
  });

  if (parentError) {
    return { success: false, error: '학부모 프로필 생성에 실패했습니다: ' + parentError.message };
  }

  // 5. parent_student_links 테이블에 자녀 연결 정보 저장
  const linkInserts = studentIds.map(studentId => ({
    parent_id: userId,
    student_id: studentId,
  }));

  const { error: linkError } = await supabase
    .from('parent_student_links')
    .insert(linkInserts);

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

  // #region agent log
  const logUrl = 'http://127.0.0.1:7247/ingest/888ac2ee-d945-49d4-9c42-79185fbe90b3';
  await fetch(logUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'actions.ts:signIn:start',message:'signIn called',data:{email},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
  // #endregion

  if (!email || !password) {
    return { success: false, error: '이메일과 비밀번호를 입력해주세요.' };
  }

  const supabase = await createClient();

  // #region agent log
  await fetch(logUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'actions.ts:signIn:beforeAuth',message:'About to call signInWithPassword',data:{email},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
  // #endregion

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // #region agent log
    await fetch(logUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'actions.ts:signIn:afterAuth',message:'signInWithPassword result',data:{hasError:!!error,errorMsg:error?.message},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
    // #endregion

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        return { success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
      }
      return { success: false, error: error.message };
    }

    // #region agent log
    await fetch(logUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'actions.ts:signIn:success',message:'Returning success',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
    // #endregion

    return { success: true };
  } catch (e) {
    // #region agent log
    await fetch(logUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'actions.ts:signIn:catch',message:'Exception caught',data:{error:String(e)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    return { success: false, error: '로그인 중 오류가 발생했습니다.' };
  }
}

/**
 * 로그아웃
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

/**
 * 비밀번호 재설정 이메일 발송
 */
export async function resetPassword(formData: FormData): Promise<AuthResult> {
  const email = formData.get('email') as string;

  if (!email) {
    return { success: false, error: '이메일을 입력해주세요.' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  });

  if (error) {
    return { success: false, error: error.message };
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

  const supabase = await createClient();

  // student_profiles에서 코드로 학생 찾기
  const { data: studentProfile, error: studentError } = await supabase
    .from('student_profiles')
    .select('id')
    .eq('parent_code', code)
    .single();

  if (studentError || !studentProfile) {
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

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return profile;
}
