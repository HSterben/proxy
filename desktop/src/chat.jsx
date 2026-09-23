import { createRoot } from 'react-dom/client';
import { ThemeBridge } from './hooks/useTheme';
import ChatView from './views/ChatView';

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <ThemeBridge>
    <ChatView />
  </ThemeBridge>,
);
