// isAuth has already loaded and validated the user by the time this runs.
export const getCurrentUser = (req, res) => res.status(200).json(req.user);
