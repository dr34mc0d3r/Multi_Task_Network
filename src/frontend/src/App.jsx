import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import MultiTaskNetwork from './pages/MultiTaskNetwork'
import TrainingData from './pages/TrainingData'
import DataAcquire from './pages/DataAcquire'
import Training from './pages/Training'
import Evaluation from './pages/Evaluation'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="multi-task-network" element={<MultiTaskNetwork />} />
        <Route path="training-data" element={<TrainingData />} />
        <Route path="data" element={<DataAcquire />} />
        <Route path="training" element={<Training />} />
        <Route path="evaluation" element={<Evaluation />} />
      </Route>
    </Routes>
  )
}
