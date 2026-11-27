import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import Home from './pages/Home'
import StudentJoin from './pages/StudentJoin'
import WordList from './pages/WordList'
import LearnWord from './pages/LearnWord'
import Teacher from './pages/Teacher'
import Review from './pages/Review'
import BellHost from './pages/bell/BellHost'
import BellPlay from './pages/bell/BellPlay'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join" element={<StudentJoin />} />
        <Route path="/learn" element={<WordList />} />
        <Route path="/learn/:wordId" element={<LearnWord />} />
        <Route path="/teacher" element={<Teacher />} />
        <Route path="/review" element={<Review />} />
        <Route path="/bell" element={<BellPlay />} />
        <Route path="/bell/host/:classId" element={<BellHost />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
