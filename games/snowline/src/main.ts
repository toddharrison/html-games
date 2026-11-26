import './ui/style.css';
import { App } from './platform/app.ts';
import { runCheckPage } from './platform/check.ts';

const root = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
if (params.get('check') === '1') runCheckPage(root);
else new App(root, params).start();
