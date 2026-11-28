import {
  Autocomplete,
  Button,
  Checkbox,
  Chip,
  createTheme,
  FileInput,
  MultiSelect,
  NumberInput,
  PasswordInput,
  InputClearButton,
  Pill,
  Select,
  Switch,
  Tabs,
  CloseButton,
  Textarea,
  TagsInput,
  TextInput,
} from '@mantine/core';

// Mobile first: "md" inputs/buttons are 42px tall (our minimum tap target) with a 16px font (iOS Safari zooms
// into inputs with a smaller font on focus).
export const theme = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'md',
  components: {
    Button: Button.extend({ defaultProps: { size: 'md' } }),
    TextInput: TextInput.extend({ defaultProps: { size: 'md' } }),
    PasswordInput: PasswordInput.extend({
      defaultProps: {
        size: 'md',
        rightSectionWidth: '2.625rem',
        // Mantine's default label is English; the toggle fills the 42px field height.
        visibilityToggleButtonProps: {
          'aria-label': 'Passwort anzeigen oder verbergen',
          style: { width: '2.625rem', height: '2.625rem', flexShrink: 0 },
        },
      },
    }),
    Pill: Pill.extend({ defaultProps: { removeButtonProps: { 'aria-label': 'Entfernen' } } }),
    // Clear buttons of Select/TimePicker/... and other close buttons: 42px touch target.
    CloseButton: CloseButton.extend({ styles: { root: { '--cb-size': '2.625rem' } } }),
    // The clear button inside Select/DateInput/...: same size, German name.
    InputClearButton: InputClearButton.extend({
      defaultProps: { 'aria-label': 'Leeren' },
      styles: {
        // Inside the 42px field minus its 1px border, so it doesn't cover the border or the focus ring.
        root: {
          '--cb-size': '2.5rem',
          '--cb-icon-size': '1.125rem',
          width: '2.5rem',
          height: '2.5rem',
          minWidth: '2.5rem',
          backgroundColor: 'transparent',
        },
      },
    }),
    // Tab rows and switch rows: 42px touch target.
    Tabs: Tabs.extend({ styles: { tab: { minHeight: '2.625rem' } } }),
    Switch: Switch.extend({
      styles: {
        body: { minHeight: '2.625rem', alignItems: 'center' },
        labelWrapper: { display: 'flex', alignItems: 'center', minHeight: '2.625rem' },
      },
    }),
    Textarea: Textarea.extend({ defaultProps: { size: 'md' } }),
    FileInput: FileInput.extend({ defaultProps: { size: 'md' } }),
    // Selects are not free text: stop iOS from offering AutoFill suggestions above the keyboard.
    // No opening on (keyboard) focus: Enter then moves to the next field instead of picking the
    // highlighted option; a click or typing still opens the dropdown.
    Select: Select.extend({
      defaultProps: { size: 'md', autoComplete: 'off', inputMode: 'none', openOnFocus: false },
    }),
    Autocomplete: Autocomplete.extend({ defaultProps: { size: 'md' } }),
    NumberInput: NumberInput.extend({ defaultProps: { size: 'md' } }),
    MultiSelect: MultiSelect.extend({ defaultProps: { size: 'md', autoComplete: 'off' } }),
    TagsInput: TagsInput.extend({ defaultProps: { size: 'md' } }),
    Checkbox: Checkbox.extend({ defaultProps: { size: 'md' } }),
    Chip: Chip.extend({ defaultProps: { size: 'md' } }),
  },
});
