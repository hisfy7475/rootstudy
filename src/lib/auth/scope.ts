import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * 요청자(auth user)에 대해 허용되는 branch_id 집합과 관련 메타를 반환한다.
 *
 * - admin/student: 자기 profile.branch_id 1개.
 * - parent: 연결된 자녀들(`parent_student_links`)의 `profiles.branch_id` UNION (distinct).
 *
 * 학부모는 "자녀의 학부모"로 정의되기 때문에 `profiles.branch_id` 컬럼을 쓰지 않고
 * 자녀 지점 집합을 scope로 삼는다. 공용 유틸이며, 모든 서버 액션은 여기서 scope를 받아
 * 필터에 사용해야 한다.
 *
 * `react.cache` 로 감싸 **같은 request 안에서는 한 번만 DB를 조회**한다.
 * 인자 identity 기반 캐시 함정을 피하려고 **인자를 받지 않으며** 내부에서
 * `createClient()` 를 호출한다.
 */
export type UserScope = {
  userId: string;
  userType: "student" | "parent" | "admin";
  /** 요청자에게 허용된 branch_id 집합. 비어 있으면 접근 권한 없음. */
  branchIds: string[];
  /**
   * parent: 연결된 자녀 id 목록
   * student: [userId]
   * admin: []
   */
  studentIds: string[];
  /** branchIds.length > 0. 호출부 early-return 판정에 사용. */
  hasAccess: boolean;
};

/** 내부용 — cache 밖에서 await 가능한 resolver */
async function resolveScope(): Promise<UserScope | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_type, branch_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  const userType = profile.user_type as UserScope["userType"];

  if (userType === "admin" || userType === "student") {
    const branchId = profile.branch_id as string | null;
    const branchIds = branchId ? [branchId] : [];
    return {
      userId: user.id,
      userType,
      branchIds,
      studentIds: userType === "student" ? [user.id] : [],
      hasAccess: branchIds.length > 0,
    };
  }

  // parent: 자녀들의 지점 수집
  const { data: links } = await supabase
    .from("parent_student_links")
    .select("student_id, profiles!parent_student_links_student_id_fkey(branch_id)")
    .eq("parent_id", user.id);

  type LinkRow = {
    student_id: string;
    profiles: { branch_id: string | null } | { branch_id: string | null }[] | null;
  };

  const studentIds: string[] = [];
  const branchIdSet = new Set<string>();

  for (const raw of (links ?? []) as LinkRow[]) {
    studentIds.push(raw.student_id);
    const p = Array.isArray(raw.profiles) ? raw.profiles[0] : raw.profiles;
    if (p?.branch_id) branchIdSet.add(p.branch_id);
  }

  const branchIds = [...branchIdSet];
  return {
    userId: user.id,
    userType: "parent",
    branchIds,
    studentIds,
    hasAccess: branchIds.length > 0,
  };
}

/** 요청자 scope 조회. 같은 request 안 re-call은 캐시. */
export const getUserScope = cache((): Promise<UserScope | null> => resolveScope());

/**
 * 현재 parent 사용자가 주어진 studentId에 대해 조치 가능한지 확인.
 * parent_student_links 존재 여부로 판정. parent 외 역할은 그대로 false (호출부에서 별도 처리).
 */
export const requireParentLinkedStudent = cache(
  async (studentId: string): Promise<boolean> => {
    const scope = await resolveScope();
    if (!scope || scope.userType !== "parent") return false;
    return scope.studentIds.includes(studentId);
  },
);
