import { Sparkles } from "lucide-react"

export default function Logo({ size = 36 }) {
  return (
    <div
      className="grid place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 shadow-lg shadow-violet-500/30"
      style={{ width: size, height: size }}
    >
      <Sparkles size={Math.round(size * 0.52)} className="text-white" />
    </div>
  )
}
