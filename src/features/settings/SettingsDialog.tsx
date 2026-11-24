import { useId } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import type { AppSettings, ThemePreference } from '../../lib/appSettings';
import styles from './settings.module.css';

interface SettingsDialogProps {
  open: boolean;
  settings: AppSettings;
  onThemeChange: (theme: ThemePreference) => void;
  onReducedMotionChange: (reducedMotion: boolean) => void;
  onClose: () => void;
}

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  hint: string;
}> = [
  { value: 'system', label: 'System', hint: 'Follow the appearance set in your operating system.' },
  { value: 'light', label: 'Light', hint: 'Bright surfaces with dark text.' },
  { value: 'dark', label: 'Dark', hint: 'Dim surfaces with light text.' },
];

export function SettingsDialog({
  open,
  settings,
  onThemeChange,
  onReducedMotionChange,
  onClose,
}: SettingsDialogProps) {
  const themeGroupId = useId();

  return (
    <Dialog
      open={open}
      title="Settings"
      description="Personalize how Task Sessions looks and feels. These preferences stay on this device."
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className={styles.sections}>
        <fieldset className={styles.group} aria-describedby={`${themeGroupId}-hint`}>
          <legend className={styles.groupTitle}>Theme</legend>
          <p id={`${themeGroupId}-hint`} className={styles.groupHint}>
            Choose how the app is lit.
          </p>
          <div className={styles.options}>
            {THEME_OPTIONS.map((option) => (
              <label key={option.value} className={styles.option}>
                <input
                  type="radio"
                  name="theme"
                  value={option.value}
                  checked={settings.theme === option.value}
                  onChange={() => onThemeChange(option.value)}
                />
                <span className={styles.optionCopy}>
                  <span className={styles.optionLabel}>{option.label}</span>
                  <span className={styles.optionHint}>{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.group}>
          <p className={styles.groupTitle}>Motion</p>
          <p className={styles.groupHint}>
            Useful if animations feel distracting or cause discomfort.
          </p>
          <label className={styles.toggleOption}>
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(event) => onReducedMotionChange(event.target.checked)}
            />
            <span className={styles.optionCopy}>
              <span className={styles.optionLabel}>Reduce motion</span>
              <span className={styles.optionHint}>
                Turn off transitions and animations across the app.
              </span>
            </span>
          </label>
        </div>
      </div>
    </Dialog>
  );
}
