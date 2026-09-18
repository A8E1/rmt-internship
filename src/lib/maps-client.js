// Session retrieval is for transport; the server must validate the token with getUser.
export async function requestMaps(supabase, action, payload) {
  const { data, error: sessionError } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (sessionError || !token) throw new Error('Sign in to use maps');
  const { data: result, error } = await supabase.functions.invoke('maps-proxy', {
    body: { ...payload, action }, headers: { Authorization: 'Bearer ' + token },
  });
  if (error || !result || result.error) throw new Error('Maps are unavailable');
  return result;
}
