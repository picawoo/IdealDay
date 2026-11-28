import { Link } from 'react-router'
import { paths } from '../../app/router/paths'
import { PageHeading } from '../../shared/ui/PageHeading'

export function NotFoundPage() {
  return (
    <>
      <PageHeading>404 — Страница не найдена</PageHeading>
      <p><Link to={paths.dashboard}>На главную</Link></p>
    </>
  )
}
