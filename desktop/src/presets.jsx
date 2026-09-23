import { createRoot } from 'react-dom/client';
import { ThemeBridge } from './hooks/useTheme';
import PresetsView from './views/PresetsView';
import './index.css';

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <ThemeBridge>
    <PresetsView />
  </ThemeBridge>,
);
