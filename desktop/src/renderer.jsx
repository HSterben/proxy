import { createRoot } from 'react-dom/client';
import { ThemeBridge } from './hooks/useTheme';
import ChatBubbleView from './views/ChatBubbleView';

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <ThemeBridge>
    <ChatBubbleView />
  </ThemeBridge>,
);
