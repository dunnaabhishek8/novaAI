import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { useSelector } from "react-redux"
import useGetCurrentUser from "./hooks/useGetCurrentUser"
import AuthPage from "./pages/AuthPage"
import Chat from "./pages/Chat"
import Logo from "./components/Logo"

export default function App() {
  useGetCurrentUser()
  const { userData, authLoading } = useSelector((state) => state.user)

  if (authLoading) {
    return (
      <div className="h-full grid place-items-center bg-[#07070c]">
        <div className="animate-pulse"><Logo size={56} /></div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={userData ? <Navigate to="/chat" replace /> : <AuthPage />} />
        <Route path="/chat" element={userData ? <Chat /> : <Navigate to="/" replace />} />
        <Route path="/chat/:threadId" element={userData ? <Chat /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
