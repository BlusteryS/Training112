import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';

export type ModalId = 'form';

type ModalLocationState = {
  backgroundLocation?: Location;
};

export function useModal() {
  const location = useLocation();
  const navigate = useNavigate();

  const open = useCallback(
    (id: ModalId) => {
      navigate(`/modal/${id}${location.hash}`, {
        state: { backgroundLocation: location } satisfies ModalLocationState,
      });
    },
    [location, navigate],
  );

  const close = useCallback(() => {
    const state = location.state as ModalLocationState | null;

    if (state?.backgroundLocation) {
      navigate(-1);
      return;
    }

    navigate('/#modal', { replace: true });
  }, [location.state, navigate]);

  return useMemo(() => ({ close, open }), [close, open]);
}
