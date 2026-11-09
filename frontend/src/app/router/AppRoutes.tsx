import { Navigate, Route, Routes } from 'react-router'
import { AnalyticsPage } from '../../modules/analytics/AnalyticsPage'
import { LoginPage } from '../../modules/auth/LoginPage'
import { RegisterPage } from '../../modules/auth/RegisterPage'
import { BiorhythmsPage } from '../../modules/biorhythms/BiorhythmsPage'
import { DashboardPage } from '../../modules/dashboard/DashboardPage'
import { NotFoundPage } from '../../modules/not-found/NotFoundPage'
import { OnboardingPage } from '../../modules/onboarding/OnboardingPage'
import { ProfilePage } from '../../modules/profile/ProfilePage'
import { SchedulePage } from '../../modules/schedule/SchedulePage'
import { SettingsPage } from '../../modules/settings/SettingsPage'
import { TasksPage } from '../../modules/tasks/TasksPage'
import { TaskDetailPage } from '../../modules/tasks/TaskDetailPage'
import { TaskFormPage } from '../../modules/tasks/TaskFormPage'
import { AppLayout } from '../layouts/AppLayout'
import { paths } from './paths'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to={paths.dashboard} replace />} />
        <Route path={paths.register} element={<RegisterPage />} />
        <Route path={paths.login} element={<LoginPage />} />
        <Route path={paths.onboarding} element={<OnboardingPage />} />
        <Route path={paths.dashboard} element={<DashboardPage />} />
        <Route path={paths.biorhythms} element={<BiorhythmsPage />} />
        <Route path={paths.tasks} element={<TasksPage />} />
        <Route path={paths.taskNew} element={<TaskFormPage />} />
        <Route path={paths.taskDetail} element={<TaskDetailPage />} />
        <Route path={paths.taskEdit} element={<TaskFormPage />} />
        <Route path={paths.schedule} element={<SchedulePage />} />
        <Route path={paths.analytics} element={<AnalyticsPage />} />
        <Route path={paths.profile} element={<ProfilePage />} />
        <Route path={paths.settings} element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
