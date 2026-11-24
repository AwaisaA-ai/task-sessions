import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import fields from '../../styles/fields.module.css';

const STORAGE_KEY = 'task-sessions:onboarding-dismissed';

const COPY = {
  title: 'Your data lives on this device first.',
  body: 'Task Sessions runs fully offline and fully online. Cloud sync through your own Supabase project is optional. Turn it on any time; the app keeps working with or without it.',
};

interface OnboardingBannerProps {
  open: boolean;
  onClose: () => void;
}

export function OnboardingBanner({ open, onClose }: OnboardingBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (open) setDismissed(window.localStorage.getItem(STORAGE_KEY) === 'true');
  }, [open]);

  if (!open || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // Private browsing modes simply skip the dismissal.
    }
    onClose();
  }

  return (
    <div className="onboardingBanner" role="note">
      <div className="onboardingBannerCopy">
        <p className="onboardingBannerTitle">{COPY.title}</p>
        <p className="onboardingBannerBody">{COPY.body}</p>
      </div>
      <div className={fields.actions}>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Not now
        </Button>
        <Button size="sm" variant="secondary" onClick={dismiss}>
          Got it
        </Button>
      </div>
    </div>
  );
}
