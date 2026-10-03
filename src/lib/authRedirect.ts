/**
 * Supabase 메일 링크(비밀번호 재설정 등)로 앱이 열렸을 때 주소의 # 뒤 값을 앱이 처음 열린 순간에 읽어 둡니다.
 * supabase-js 가 이 값으로 세션을 만든 뒤 주소에서 지우므로, 지워지기 전에 읽어야 합니다.
 *   - 성공: #access_token=…&type=recovery
 *   - 실패: #error=access_denied&error_code=otp_expired&error_description=…
 * 토큰은 여기 저장하지 않고 종류와 오류만 기억합니다.
 */
export type AuthRedirect = { type: 'recovery' } | { type: 'error'; code: string; description: string } | null

function readAuthRedirect(): AuthRedirect {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  if (params.get('error') || params.get('error_code') || params.get('error_description')) {
    return {
      type: 'error',
      code: params.get('error_code') || params.get('error') || '',
      description: params.get('error_description') || '',
    }
  }
  if (params.get('type') === 'recovery' && params.get('access_token')) return { type: 'recovery' }
  return null
}

export const initialAuthRedirect: AuthRedirect = readAuthRedirect()

// 재설정 링크로 들어왔는데 다른 주소(예: Redirect URL 미등록으로 Site URL)로 열렸으면 /reset-password 로 한 번 보냄
// (오류 링크는 가입 확인 메일 등에서도 오므로 보내지 않음)
let recoveryPending = initialAuthRedirect?.type === 'recovery'

export function isRecoveryRedirectPending() {
  return recoveryPending
}

/** /reset-password 화면이 열리면 호출. 이후에는 다른 화면으로 자유롭게 이동 */
export function markRecoveryRedirectHandled() {
  recoveryPending = false
}
