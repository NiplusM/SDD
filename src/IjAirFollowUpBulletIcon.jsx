const followUpBulletIcon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAABYlAAAWJQFJUiTwAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAOdEVYdFNvZnR3YXJlAEZpZ21hnrGWYwAAATFJREFUeAHtldFNwzAQQO/ciP4yQtggbEAnqVgAEglFCj/kh0ZNP6yWAWCDignKCN2AjJBv6viwq/KZcBauSiU/KXEinX3PZ1kHEAgEzoGqXn7OzANHIOIEEUAMR0LAiQkCQeDkAqxryKGWMlFqNMWoWxZZ1nDneauA+hIpEKW0E+tSykvuPCeBoYVR6xIBGvOZXOzEhivBEkDEDzuOFSR9MUVhyt7piasES4B0974fSbxWUsbAlBir0Rp+AYFJtVhtiOjm8Ls1VWn7Yk1cDIf+gQLfioe7W/irgOV5LkuBYurYnJrH/P4KfAj8UNcy6RB6z5dASPNKzOotKn29PxqfAkNUi5cnIl3a5BHpSZ5n26F4rwKuyb0KzOarFJCkS3KLx17Q2e20pgIZN3kg8C/4Bkt1fvL8+CzpAAAAAElFTkSuQmCC';

export function IjAirFollowUpBulletIcon({ className, ...props }) {
  return (
    <img
      src={followUpBulletIcon}
      className={className}
      width={16}
      height={16}
      alt=""
      aria-hidden="true"
      {...props}
    />
  );
}
