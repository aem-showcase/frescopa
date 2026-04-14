/**
 * CUG (Closed User Group) user info for the header.
 *
 * Calls /auth/me to check authentication state and renders
 * a sign-in link or user name with sign-out in the nav tools area.
 */

export default async function renderCugUser(navTools) {
  const wrapper = document.createElement('div');
  wrapper.className = 'cug-user-wrapper nav-tools-wrapper';

  let user;
  try {
    const resp = await fetch('/auth/me');
    user = resp.ok ? await resp.json() : null;
  } catch {
    user = null;
  }

  if (!user?.authenticated) {
    const signIn = document.createElement('a');
    signIn.href = `/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    signIn.className = 'cug-sign-in';
    signIn.textContent = 'Sign in';
    wrapper.append(signIn);
  } else {
    const userName = document.createElement('span');
    userName.className = 'cug-user-name';
    userName.textContent = user.name || user.email;
    wrapper.append(userName);

    const signOut = document.createElement('a');
    signOut.href = '/auth/logout';
    signOut.className = 'cug-sign-out';
    signOut.textContent = 'Sign out';
    wrapper.append(signOut);
  }

  navTools.append(wrapper);
}
