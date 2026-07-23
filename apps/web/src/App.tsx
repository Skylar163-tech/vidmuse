import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import { AiPage } from './pages/AiPage'
import { HomePage } from './pages/HomePage'
import { ProPage } from './pages/ProPage'

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/pro" element={<ProPage />} />
          <Route path="/ai" element={<AiPage />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}
