import { Link, NavLink, useLocation } from 'react-router'
import { ChronotypeIcon } from '../../modules/profile/ChronotypeIcon'
import calendarIcon from '../../assets/icons/calendar.svg'
import chartIcon from '../../assets/icons/chart.svg'
import homeIcon from '../../assets/icons/home.svg'
import settingsIcon from '../../assets/icons/settings.svg'
import sunIcon from '../../assets/icons/sun.svg'
import tasksIcon from '../../assets/icons/tasks.svg'
import userIcon from '../../assets/icons/user.svg'
import waveIcon from '../../assets/icons/wave.svg'
import { ProfileAvatar } from '../../modules/profile/ProfileAvatar'
import { usePreferences } from '../../modules/settings/usePreferences'
import { formatDate, parseDate } from '../../shared/lib/calendar'
import { paths } from '../router/paths'
import styles from './Sidebar.module.css'

const items = [
  { label: 'Главная', to: paths.dashboard, icon: homeIcon },
  { label: 'Мои задачи', to: paths.tasks, icon: tasksIcon },
  { label: 'Расписание', to: paths.schedule, icon: calendarIcon },
  { label: 'Биоритмы', to: paths.biorhythms, icon: waveIcon },
  { label: 'Аналитика', to: paths.analytics, icon: chartIcon },
  { label: 'Профиль', to: paths.profile, icon: userIcon },
  { label: 'Настройки', to: paths.settings, icon: settingsIcon },
] as const

const chronotypeCards = {
  lark: 'Вам может быть удобнее начинать день раньше и выполнять важные дела в первой половине дня.',
  pigeon: 'Вам может подходить равномерное распределение дел в течение дня с регулярными паузами.',
  owl: 'Вам может быть комфортнее начинать день позже и заниматься важными делами ближе к вечеру.',
}

export function Sidebar() {
  const { pathname, search } = useLocation()
  const { profile, rhythm, chronotype, isDemo, isLocalSetup } = usePreferences()
  const isRhythmPage = pathname === paths.dashboard || pathname === paths.biorhythms
  const isSchedulePage = pathname === paths.schedule
  const showAccount = isRhythmPage || isSchedulePage || pathname === paths.tasks || pathname.startsWith(paths.tasks + '/')
    || pathname === paths.profile || pathname === paths.settings
  const date = isRhythmPage || isSchedulePage ? parseDate(new URLSearchParams(search).get('date')) : null

  const card = chronotypeCards[chronotype]

  function rhythmLink(path: string) {
    return date && (path === paths.dashboard || path === paths.biorhythms || path === paths.schedule) ? path + '?date=' + date : path
  }

  return (
    <aside className={styles.sidebar}>
      <Link className={styles.brand} to={rhythmLink(paths.dashboard)}>
        <img src={sunIcon} alt="" width="28" height="28" />
        <span>Идеальный<br />День</span>
      </Link>

      <span className={styles.caption}>Личный ритм</span>
      <nav aria-label="Основная навигация">
        <ul className={styles.navList}>
          {items.map(({ label, to, icon }) => (
            <li key={to}>
              <NavLink className={styles.navLink} to={rhythmLink(to)}>
                <span
                  aria-hidden="true"
                  className={styles.navIcon}
                  style={{ maskImage: `url("${icon}")` }}
                />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {(showAccount || pathname === paths.analytics) && <section className={styles.chronotype} data-chronotype={chronotype} aria-label="Хронотип">
        <strong><ChronotypeIcon chronotype={chronotype} />{rhythm.label}</strong>
        <p>{card}</p>
        <Link to={paths.profile}>Изменить хронотип</Link>
      </section>}
      {showAccount && (
        <Link
          className={styles.account}
          to={paths.profile}
          title={isDemo && !isLocalSetup ? 'Тестовая дата рождения: ' + formatDate(profile.birthDate, { dateStyle: 'short' }) : 'Открыть профиль'}
        >
          <ProfileAvatar src={profile.avatar} />
          <span className={styles.accountText}>
            <strong>{profile.name || 'Мой профиль'}</strong>
            <small>{isLocalSetup ? 'Локальные настройки' : isDemo ? 'Демонстрационный профиль' : 'Личный профиль'}</small>
          </span>
        </Link>
      )}
    </aside>
  )
}
