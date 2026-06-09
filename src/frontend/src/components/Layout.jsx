import { NavLink, Outlet } from 'react-router-dom'

export default function Layout() {
  const linkClass = ({ isActive }) =>
    isActive
      ? 'text-blue-600 font-semibold'
      : 'text-gray-600 hover:text-blue-500'

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex gap-6 items-center">
        <span className="font-bold text-gray-800 mr-4">lstm-2</span>
        <NavLink to="/" end className={linkClass}>
          Home
        </NavLink>
        <NavLink to="/data" className={linkClass}>
          Data Acquire
        </NavLink>
        <NavLink to="/multi-task-network" className={linkClass}>
          Multi-Task Network
        </NavLink>
        <NavLink to="/training-data" className={linkClass}>
          Training Data
        </NavLink>
<NavLink to="/training" className={linkClass}>
          Training
        </NavLink>
        <NavLink to="/evaluation" className={linkClass}>
          Evaluation
        </NavLink>
      </nav>
      <main className="max-w-4xl mx-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
