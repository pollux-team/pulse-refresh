import { initializeBackgroundController } from '@/src/lib/background-controller';

export default defineBackground(() => {
  initializeBackgroundController();
});
