/** PATCH a notification to read=true (recipient-scoped on the server). */
export const markNotificationRead = async (
  apiRoute: string,
  slug: string,
  id: string,
): Promise<void> => {
  await fetch(`${apiRoute}/${slug}/${id}`, {
    body: JSON.stringify({ read: true }),
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH',
  })
}
