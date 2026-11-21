import lark from '../../assets/icons/chronotype-lark.svg'
import pigeon from '../../assets/icons/chronotype-pigeon.svg'
import owl from '../../assets/icons/chronotype-owl.svg'
import type { Chronotype } from '../settings/preferences'
import styles from '../settings/Preferences.module.css'

const icons = { lark, pigeon, owl }

export function ChronotypeIcon({ chronotype }: { chronotype: Chronotype }) {
  return <span className={styles.chronotypeIcon} style={{ maskImage: 'url("' + icons[chronotype] + '")' }} aria-hidden="true" />
}
