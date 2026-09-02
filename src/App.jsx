import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import CV from './components/CV'
import Projects from './components/Projects'
import Contact from './components/Contact'
import CSVViewer from './components/CSVViewer'
import './App.css'

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
    const nav = document.getElementById('navbarNav')
    if (nav?.classList.contains('show')) {
      nav.classList.remove('show')
    }
  }, [pathname])

  return null
}

function App() {
  return (
    <div className="App">
      <Navbar />
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Navigate to="/cv" replace />} />
        <Route path="/cv" element={<CV />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/csv-viewer" element={<CSVViewer />} />
        <Route path="/contact" element={<Contact />} />
      </Routes>
    </div>
  )
}

export default App
