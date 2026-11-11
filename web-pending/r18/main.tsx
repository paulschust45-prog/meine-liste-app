import { createRoot } from 'react-dom/client';
import Planner from './Planner';
import Witness from './Witness';
import './index.css';
const wt = new URLSearchParams(location.search).get('witness');
createRoot(document.getElementById('root')!).render(wt ? <Witness t={wt} /> : <Planner />);
