import { useEffect } from "react"
import { useDispatch } from "react-redux"
import { userApi } from "../api"
import { setUserData } from "../redux/userSlice"

export default function useGetCurrentUser() {
  const dispatch = useDispatch()
  useEffect(() => {
    let cancelled = false
    userApi
      .get("/me")
      .then(({ data }) => !cancelled && dispatch(setUserData(data)))
      .catch(() => !cancelled && dispatch(setUserData(null))) // 401 = simply not logged in
    return () => { cancelled = true }
  }, [dispatch])
}
