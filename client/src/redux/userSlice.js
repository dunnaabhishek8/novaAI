import { createSlice } from "@reduxjs/toolkit"

const userSlice = createSlice({
  name: "user",
  initialState: {
    userData: null,
    // true until the first /me check finishes, so we don't flash the login page at logged-in users
    authLoading: true,
  },
  reducers: {
    setUserData: (state, action) => {
      state.userData = action.payload
      state.authLoading = false
    },
  },
})

export const { setUserData } = userSlice.actions
export default userSlice.reducer
