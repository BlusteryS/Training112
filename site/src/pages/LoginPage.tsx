import { useEffect, useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  Card,
  Input,
  Placeholder,
  useSnackbar,
} from '@training112/components';
import { Icon16ExternalLink, Icon20Warning } from '@training112/icons';
import brandLogo from '../assets/auth-brand.svg';
import successIllustration from '../assets/auth-success.svg';
import styles from './LoginPage.module.css';

const DEMO_LOGIN = 'admin';
const DEMO_PASSWORD = 'admin';
const REDIRECT_DELAY_MS = 3000;

type LoginPageProps = {
  onLogin: () => void;
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const snackbar = useSnackbar();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginSuccessful, setIsLoginSuccessful] = useState(false);
  const canSubmit = login.trim().length > 0 && password.length > 0;

  useEffect(() => {
    if (!isLoginSuccessful) {
      return;
    }

    const redirectTimer = window.setTimeout(onLogin, REDIRECT_DELAY_MS);

    return () => window.clearTimeout(redirectTimer);
  }, [isLoginSuccessful, onLogin]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    if (login.trim() !== DEMO_LOGIN || password !== DEMO_PASSWORD) {
      snackbar.open({
        before: <Icon20Warning className={styles.warningIcon} />,
        className: styles.errorSnackbar,
        title: 'Неверные данные',
        subtitle: 'Логин и пароль неверные. Обратитесь к оператору для восстановления доступа',
      });
      return;
    }

    setIsLoginSuccessful(true);
  };

  const handleForgotPassword = () => {
    snackbar.open({
      title: 'Восстановление пароля',
      subtitle: 'Обратитесь к администратору учебной платформы.',
    });
  };

  return (
    <main className={styles.page}>
      <img
        alt="Московский инновационный кластер"
        className={styles.brand}
        height="40"
        src={brandLogo}
        width="167"
      />

      <Card appearance="primary" className={styles.card}>
        <div className={styles.intro}>
          <Badge
            before={<Icon16ExternalLink />}
            color="warning"
          >
            Учебная версия
          </Badge>

          {!isLoginSuccessful ? (
            <div className={styles.heading}>
              <h1 className={styles.title}>
                Тысячи людей нуждаются
                <br />
                в вашей помощи сейчас
              </h1>
              <p className={styles.subtitle}>Самое время начать работу</p>
            </div>
          ) : null}
        </div>

        {isLoginSuccessful ? (
          <Placeholder
            icon={(
              <img
                alt=""
                className={styles.successIllustration}
                height="124"
                src={successIllustration}
                width="180"
              />
            )}
            subtitle="Перенаправляем вас в личный кабинет специалиста службы 112"
            title="Успешно вошли"
          />
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.fields}>
              <Input
                aria-label="Логин"
                autoComplete="username"
                autoFocus
                className={styles.control}
                name="login"
                onChange={(event) => setLogin(event.target.value)}
                placeholder="Логин"
                value={login}
              />
              <Input
                aria-label="Пароль"
                autoComplete="current-password"
                className={styles.control}
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Пароль"
                type="password"
                value={password}
              />
            </div>

            <div className={styles.actions}>
              <Button
                className={styles.control}
                disabled={!canSubmit}
                size="large"
                type="submit"
              >
                Войти
              </Button>
              <Button
                className={styles.control}
                mode="outline"
                onClick={handleForgotPassword}
                size="large"
                type="button"
              >
                Забыл пароль
              </Button>
            </div>
          </form>
        )}
      </Card>

      <div aria-hidden="true" className={styles.callout}>
        <span className={styles.calloutNumber}>112</span>
        <span className={styles.calloutText}>
          Люди
          <br />
          нуждаются в тебе
        </span>
      </div>
    </main>
  );
}
