import background from '../../assets/icons/avatar-background.svg'
import earrings from '../../assets/icons/avatar-earrings.svg'
import face from '../../assets/icons/avatar-face.svg'
import hairBack from '../../assets/icons/avatar-hair-back.svg'
import hairFront from '../../assets/icons/avatar-hair-front.svg'
import neck from '../../assets/icons/avatar-neck.svg'
import shirt from '../../assets/icons/avatar-shirt.svg'
import styles from './DemoAvatar.module.css'

export function DemoAvatar() {
  return (
    <span className={styles.avatar} aria-hidden="true">
      <span className={styles.art}>
        <img className={styles.background} src={background} alt="" />
        <span className={styles.portrait}>
          <img className={styles.hairBack} src={hairBack} alt="" />
          <img className={styles.shirt} src={shirt} alt="" />
          <img className={styles.neck} src={neck} alt="" />
          <img className={styles.face} src={face} alt="" />
          <img className={styles.hairFront} src={hairFront} alt="" />
          <img className={styles.earrings} src={earrings} alt="" />
        </span>
      </span>
    </span>
  )
}
