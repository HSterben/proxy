import { Navigate, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import DocumentMeta from './components/seo/DocumentMeta'
import Home from './pages/Home'
import About from './pages/About'
import States from './pages/States'
import Contact from './pages/Contact'
import Privacy from './pages/Privacy'
import AppChat from './pages/AppChat'
import AuthCallback from './pages/AuthCallback'
import Account from './pages/Account'
import Billing from './pages/Billing'
import Profile from './pages/Profile'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <>
      <DocumentMeta />
      <Routes>
        <Route path="app" element={<AppChat />} />
        <Route path="auth/callback" element={<AuthCallback />} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="account" element={<Account />} />
          <Route path="account/billing" element={<Billing />} />
          <Route path="u/:workosId" element={<Profile />} />
          <Route path="about" element={<About />} />
          <Route path="states" element={<States />} />
          <Route path="blog" element={<Navigate to="/states" replace />} />
          <Route path="blog/:slug" element={<Navigate to="/states" replace />} />
          <Route path="contact" element={<Contact />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  )
}
