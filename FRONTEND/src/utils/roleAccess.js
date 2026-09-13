export function normalizeUser(user) {
  if (!user) return null;
  return { ...user, id: user.id || user._id };
}

/** Default landing route after login or profile completion */
export function getRoleHomePath(role) {
  switch (role) {
    case "admin":
      return "/admin";
    case "hospital":
      return "/hospital";
    case "receiver":
      return "/request";
    case "donor":
      return "/donate";
    default:
      return "/home";
  }
}

export function getNavLinksForRole(role, isLoggedIn) {
  const home = { name: "Home", path: "/home" };
  const faq = { name: "FAQ", path: "/faq" };
  const profile = { name: "Profile", path: "/profile" };

  if (!isLoggedIn) {
    return [home, faq];
  }

  switch (role) {
    case "receiver":
      return [home, { name: "Request Blood", path: "/request" }, faq, profile];
    case "donor":
      return [home, { name: "Donate Blood", path: "/donate" }, faq, profile];
    case "admin":
      return [{ name: "Admin Panel", path: "/admin" }, faq];
    case "hospital":
      return [{ name: "Hospital Panel", path: "/hospital" }, faq];
    default:
      return [home, faq, profile];
  }
}

export function formatRequestStatus(status) {
  return status?.replace(/_/g, " ") || "unknown";
}
