export function initRunnerDataDrawer({
  runnerJsonInput,
  runnerDataInputMount,
  runnerJsonStatus,
  runnerDataDrawer,
  openRunnerDataDrawerBtn,
  closeRunnerDataDrawerBtn,
  applyRunnerJsonBtn,
  clearRunnerJsonBtn,
  selectedFileName,
  dataFileInput,
}) {
  if (runnerJsonInput && runnerDataInputMount) {
    runnerDataInputMount.appendChild(runnerJsonInput);
  }

  const updateStatus = () => {
    if (!runnerJsonInput || !runnerJsonStatus) return;
    const hasJson = runnerJsonInput.value.trim().length > 0;
    runnerJsonStatus.dataset.ready = hasJson ? 'true' : 'false';
    runnerJsonStatus.textContent = hasJson ? 'JSON вставлен' : 'JSON не вставлен';
  };

  const setOpen = (isOpen) => {
    if (!runnerDataDrawer) return;
    runnerDataDrawer.classList.toggle('active', isOpen);
    runnerDataDrawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    if (isOpen) setTimeout(() => runnerJsonInput?.focus(), 0);
  };

  runnerJsonInput?.addEventListener('input', updateStatus);
  openRunnerDataDrawerBtn?.addEventListener('click', () => setOpen(true));
  closeRunnerDataDrawerBtn?.addEventListener('click', () => setOpen(false));
  applyRunnerJsonBtn?.addEventListener('click', () => setOpen(false));
  clearRunnerJsonBtn?.addEventListener('click', () => {
    if (!runnerJsonInput) return;
    runnerJsonInput.value = '';
    if (selectedFileName && !dataFileInput?.files?.length) selectedFileName.textContent = 'Файл не выбран';
    updateStatus();
  });
  runnerDataDrawer?.addEventListener('click', (event) => {
    if (event.target === runnerDataDrawer) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && runnerDataDrawer?.classList.contains('active')) setOpen(false);
  });

  updateStatus();
  return { updateRunnerJsonStatus: updateStatus, setRunnerDataDrawerOpen: setOpen };
}
