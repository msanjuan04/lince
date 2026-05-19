# infra/systemd

Unidades systemd para el droplet de producción. Instalación:

```bash
# Daily heavy 04:00 (todas las fuentes, post-pipeline completo)
cp lince-daily.service /etc/systemd/system/
cp lince-daily.timer /etc/systemd/system/

# Frequent light cada 30 min de 08:00 a 23:30 (Aliseda + Pisos solo)
cp lince-frequent.service /etc/systemd/system/
cp lince-frequent.timer /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now lince-daily.timer
systemctl enable --now lince-frequent.timer
systemctl list-timers --no-pager | grep lince
```

## Por qué dos timers

- **Daily**: refresca TODO el inventario (5 crawlers + Catastro + Vision + disappeared). Tarda 20-25 min. Suficiente 1×/día.
- **Frequent**: solo Aliseda + Pisos.com (las fuentes donde aparecen las gangas frescas) con `--max 50` y SIN Catastro/Vision/disappeared. Tarda ~5-8 min. Permite captar propiedad nueva en <30 min desde publicación.

## Diagnóstico

```bash
# Última corrida de cada uno
journalctl -u lince-daily.service -n 30 --no-pager
journalctl -u lince-frequent.service -n 30 --no-pager

# Cuándo dispara la próxima
systemctl list-timers --no-pager | grep lince

# Logs persistentes
tail -f /var/log/lince-daily.log
tail -f /var/log/lince-frequent.log
```

## Apagar realtime (si te bombardea con alertas)

```bash
systemctl disable --now lince-frequent.timer
# El daily de 04:00 sigue corriendo
```
