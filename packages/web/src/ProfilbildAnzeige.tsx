import { Avatar, Image, Modal, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

/** Profile picture that opens enlarged in an overlay on click; without a picture it is inert. */
export function ProfilbildAnzeige({
  src,
  size,
  alt,
}: Readonly<{ src: string | null; size: number; alt: string }>) {
  const [offen, { open, close }] = useDisclosure(false);
  if (!src) return <Avatar size={size} radius="xl" alt="" />;
  return (
    <>
      <UnstyledButton onClick={open} aria-label="Profilbild vergrößern" style={{ lineHeight: 0 }}>
        <Avatar src={src} size={size} radius="xl" alt={alt} />
      </UnstyledButton>
      <Modal
        opened={offen}
        onClose={close}
        centered
        size="auto"
        withCloseButton
        closeButtonProps={{ 'aria-label': 'Schließen' }}
        padding="xs"
      >
        <Image src={src} alt={alt} fit="contain" maw="100%" mah="80dvh" />
      </Modal>
    </>
  );
}
