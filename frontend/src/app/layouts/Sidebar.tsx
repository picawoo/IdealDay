import { Link, NavLink, useLocation } from 'react-router'
import calendarIcon from '../../assets/icons/calendar.svg'
import chartIcon from '../../assets/icons/chart.svg'
import homeIcon from '../../assets/icons/home.svg'
import settingsIcon from '../../assets/icons/settings.svg'
import sunIcon from '../../assets/icons/sun.svg'
import tasksIcon from '../../assets/icons/tasks.svg'
import userIcon from '../../assets/icons/user.svg'
import waveIcon from '../../assets/icons/wave.svg'
import { DemoAvatar } from '../../modules/profile/DemoAvatar'
import { demoProfile } from '../../modules/profile/demoProfile'
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

export function Sidebar() {
  const { pathname, search } = useLocation()
  const isRhythmPage = pathname === paths.dashboard || pathname === paths.biorhythms
  const isSchedulePage = pathname === paths.schedule
  const showDemoAccount = isRhythmPage || isSchedulePage || pathname === paths.tasks || pathname.startsWith(paths.tasks + '/')
  const date = isRhythmPage || isSchedulePage ? parseDate(new URLSearchParams(search).get('date')) : null

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

      <div className={styles.tip}>
        <p className={styles.tipTitle}>В своём ритме</p>
        <p className={styles.tipText}>
          Планируйте с опорой<br />
          на привычки, а не вопреки<br />
          своему самочувствию.
        </p>
        {showDemoAccount && <p className={styles.chronotype}>Ваш хронотип: {demoProfile.chronotype}</p>}
      </div>
      {showDemoAccount && (
        <Link
          className={styles.account}
          to={paths.profile}
          title={'Тестовая дата рождения: ' + formatDate(demoProfile.birthDate, { dateStyle: 'short' })}
        >
          <DemoAvatar />
          <span className={styles.accountText}>
            <strong>{demoProfile.name}</strong>
            <small>Демонстрационный профиль</small>
          </span>
        </Link>
      )}
    </aside>
  )
}
