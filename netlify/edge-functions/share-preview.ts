// Link previews (WhatsApp, Telegram, e-mail) for player lists shared with clubs:
// the page itself is the same app, only the preview title, text and picture change.
// Nothing about the players is put in the preview.
export default async (_req: Request, context: { next: () => Promise<Response> }) => {
  const res = await context.next()
  if (!(res.headers.get('content-type') ?? '').includes('text/html')) return res
  const html = (await res.text())
    .replace(/<title>[^<]*<\/title>/, '<title>Players · Tony × SL Benfica</title>')
    .replace(/(property="og:title" content=")[^"]*/, '$1Players shared with you · Tony × SL Benfica')
    .replace(/(name="twitter:title" content=")[^"]*/, '$1Players shared with you · Tony × SL Benfica')
    .replace(/(property="og:description" content=")[^"]*/, '$1A selection of players from the Tony Football Excellence Programme in Rwanda, shared together with SL Benfica.')
    .replace(/og\.jpg/g, 'og-share.jpg')
    .replace(/(property="og:image:alt" content=")[^"]*/, '$1Players shared by Tony × SL Benfica')
  const headers = new Headers(res.headers); headers.delete('content-length')
  return new Response(html, { status: res.status, headers })
}
export const config = { path: '/share/*' }
