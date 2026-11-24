/**
 * The admin dashboard, served at /admin. Loaded only when someone opens
 * /admin, so it adds nothing to the public website's download size.
 */
import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { AuthProvider, ToastProvider, UnsavedChangesProvider, useAuth } from './session';
import { LoadingState } from './ui';
import LoginPage from './pages/LoginPage';
import OverviewPage from './pages/OverviewPage';
import PageEditorPage from './pages/PageEditorPage';
import PagesIndexPage from './pages/PagesIndexPage';
import PostsListPage from './pages/PostsListPage';
import PostEditorPage from './pages/PostEditorPage';
import DocumentsListPage from './pages/DocumentsListPage';
import DocumentEditorPage from './pages/DocumentEditorPage';
import MessagesPage from './pages/MessagesPage';
import TeamListPage from './pages/TeamListPage';
import TeamEditorPage from './pages/TeamEditorPage';
import ContactSettingsPage from './pages/ContactSettingsPage';
import HistoryPage from './pages/HistoryPage';
import TranslationPage from './pages/TranslationPage';
import UsersPage from './pages/UsersPage';
import AccountPage from './pages/AccountPage';

function RequireSignIn() {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <LoadingState label="Checking your session…" />;
  if (user === null) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return <AdminLayout />;
}

export default function AdminApp() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'AICTiG Dashboard';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => {
      document.title = previous;
      robots.remove();
    };
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>
        <UnsavedChangesProvider>
          <Routes>
            <Route path="login" element={<LoginPage />} />
            <Route element={<RequireSignIn />}>
              <Route index element={<OverviewPage />} />
              <Route path="pages" element={<PagesIndexPage />} />
              <Route path="pages/:pageId" element={<PageEditorPage />} />
              <Route path="news" element={<PostsListPage kind="news" />} />
              <Route path="news/new" element={<PostEditorPage key="news-new" kind="news" />} />
              <Route path="news/:id" element={<PostEditorPage key="news-edit" kind="news" />} />
              <Route path="publications" element={<PostsListPage kind="publications" />} />
              <Route path="publications/new" element={<PostEditorPage key="pub-new" kind="publications" />} />
              <Route path="publications/:id" element={<PostEditorPage key="pub-edit" kind="publications" />} />
              <Route path="repository" element={<DocumentsListPage />} />
              <Route path="repository/new" element={<DocumentEditorPage key="doc-new" />} />
              <Route path="repository/:id" element={<DocumentEditorPage key="doc-edit" />} />
              <Route path="messages" element={<MessagesPage />} />
              <Route path="team" element={<TeamListPage />} />
              <Route path="team/new" element={<TeamEditorPage />} />
              <Route path="team/:id" element={<TeamEditorPage />} />
              <Route path="contact" element={<ContactSettingsPage />} />
              <Route path="translation" element={<TranslationPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>
          </Routes>
        </UnsavedChangesProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
