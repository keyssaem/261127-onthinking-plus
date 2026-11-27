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
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
