// api/verify-password.ts
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    
    // 環境変数からパスワードを取得（設定がなければデフォルト値）
    const correctPassword = process.env.APP_PASSWORD || 'morinohibi0909';
    
    if (password === correctPassword) {
      return Response.json({ success: true });
    } else {
      return Response.json({ success: false, error: 'パスワードが正しくありません' });
    }
  } catch {
    return Response.json({ success: false, error: '認証エラー' }, { status: 500 });
  }
}
