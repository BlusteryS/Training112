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
import { ApiError, authApi, type User } from '../auth/api';
import brandLogo from '../assets/auth-brand.svg';
import successIllustration from '../assets/auth-success.svg';
import styles from './LoginPage.module.css';

const REDIRECT_DELAY_MS = 3000;

type LoginPageProps = {
  onLogin: (user: User) => void;
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const snackbar = useSnackbar();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const isLoginSuccessful = authenticatedUser !== null;
  const isRegistration = mode === 'register';
  const canSubmit = login.trim().length > 0 && password.length > 0;

  useEffect(() => {
    if (!isLoginSuccessful) {
      return;
    }

    const redirectTimer = window.setTimeout(() => authenticatedUser && onLogin(authenticatedUser), REDIRECT_DELAY_MS);

    return () => window.clearTimeout(redirectTimer);
  }, [isLoginSuccessful, onLogin, authenticatedUser]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;
    if (isRegistration && password !== confirmation) {
      snackbar.open({ title: 'Пароли не совпадают', subtitle: 'Повторите выбранный пароль.' });
      return;
    }
    setIsSubmitting(true);
    try {
      const { user } = await authApi[mode]({ login: login.trim(), password });
      setPassword('');
      setConfirmation('');
      setAuthenticatedUser(user);
    } catch (error) {
      const hasInvalidCredentials =
        !isRegistration && error instanceof ApiError && error.status === 401;

      snackbar.open({
        before: <Icon20Warning className={styles.warningIcon} />,
        className: styles.errorSnackbar,
        title: hasInvalidCredentials
          ? 'Неверные данные'
          : isRegistration
            ? 'Не удалось зарегистрироваться'
            : 'Не удалось войти',
        subtitle: hasInvalidCredentials ? (
          <>
            Логин и пароль неверные.
            <br />
            Обратитесь к оператору для восстановления доступа
          </>
        ) : error instanceof Error ? error.message : 'Попробуйте ещё раз.',
      });
    } finally {
      setIsSubmitting(false);
    }
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
              <p className={styles.subtitle}>{isRegistration ? 'Создайте аккаунт, чтобы начать работу' : 'Самое время начать работу'}</p>
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
            title={isRegistration ? 'Аккаунт создан' : 'Успешно вошли'}
          />
        ) : (
          <form aria-busy={isSubmitting} className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.fields}>
              <Input
                aria-label="Логин"
                autoComplete="username"
                autoFocus
                required
                disabled={isSubmitting}
                minLength={3}
                maxLength={32}
                pattern="[a-zA-Z0-9_]{3,32}"
                autoCapitalize="none"
                spellCheck={false}
                className={styles.control}
                name="login"
                onChange={(event) => setLogin(event.target.value)}
                placeholder="Логин"
                value={login}
              />
              <Input
                aria-label="Пароль"
                autoComplete={isRegistration ? 'new-password' : 'current-password'}
                required
                disabled={isSubmitting}
                minLength={isRegistration ? 12 : 1}
                maxLength={128}
                className={styles.control}
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Пароль"
                type="password"
                value={password}
              />
              {isRegistration ? (
                <>
                  <Input
                    aria-label="Повторите пароль"
                    autoComplete="new-password"
                    className={styles.control}
                    disabled={isSubmitting}
                    name="passwordConfirmation"
                    onChange={(event) => setConfirmation(event.target.value)}
                    placeholder="Повторите пароль"
                    required
                    type="password"
                    maxLength={128}
                    value={confirmation}
                  />
                  <p className={styles.subtitle}>Логин: 3–32 латинские буквы, цифры или _. Пароль: от 12 символов.</p>
                </>
              ) : null}
            </div>

            <div className={styles.actions}>
              <Button
                className={styles.control}
                disabled={!canSubmit || isSubmitting}
                size="large"
                type="submit"
              >
                {isSubmitting ? 'Подождите…' : isRegistration ? 'Создать аккаунт' : 'Войти'}
              </Button>
              <Button
                className={styles.control}
                mode="outline"
                disabled={isSubmitting}
                onClick={() => {
                  setMode(isRegistration ? 'login' : 'register');
                  setPassword('');
                  setConfirmation('');
                }}
                size="large"
                type="button"
              >
                {isRegistration ? 'Уже есть аккаунт' : 'Зарегистрироваться'}
              </Button>
              {!isRegistration ? (
                <button className={styles.forgotPassword} onClick={handleForgotPassword} type="button">
                  Забыл пароль
                </button>
              ) : null}
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
