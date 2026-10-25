import axios from "axios"
import { serverUrl } from "./config"
import { store } from "./redux/store"
import { setUserData } from "./redux/userSlice"

const make = (path) =>
  axios.create({ baseURL: `${serverUrl}/api${path}`, withCredentials: true })

export const authApi = make("/auth")
export const userApi = make("/user")
export const chatApi = make("/chat")

// If the session expires mid-use, forget the user so the router sends them to login.
// (Not applied to authApi: a 401 there just means "wrong email or password".)
chatApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) store.dispatch(setUserData(null))
    return Promise.reject(err)
  }
)

export const errorText = (e, fallback = "Something went wrong. Please try again.") =>
  e?.response?.data?.message ||
  (e?.request && !e?.response ? "Can't reach the server. Check your connection and try again." : fallback)
