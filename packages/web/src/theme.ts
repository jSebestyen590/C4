import {
  Button,
  Checkbox,
  Chip,
  createTheme,
  FileInput,
  PasswordInput,
  Select,
  Textarea,
  TextInput,
} from '@mantine/core';

// Mobile first: "md" inputs/buttons give >= 44px tap targets and a 16px font (iOS Safari zooms
// into inputs with a smaller font on focus).
export const theme = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'md',
  components: {
    Button: Button.extend({ defaultProps: { size: 'md' } }),
    TextInput: TextInput.extend({ defaultProps: { size: 'md' } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { size: 'md' } }),
    Textarea: Textarea.extend({ defaultProps: { size: 'md' } }),
    FileInput: FileInput.extend({ defaultProps: { size: 'md' } }),
    // Selects are not free text: stop iOS from offering AutoFill suggestions above the keyboard.
    Select: Select.extend({
      defaultProps: { size: 'md', autoComplete: 'off', inputMode: 'none' },
    }),
    Checkbox: Checkbox.extend({ defaultProps: { size: 'md' } }),
    Chip: Chip.extend({ defaultProps: { size: 'md' } }),
  },
});
