# Tiny static web server for the site (nginx on Alpine, ~50 MB).
FROM nginx:1.27-alpine

# Render (and most hosts) tell the app which port to use via $PORT.
# The nginx image fills ${PORT} into the template below at startup.
ENV PORT=10000
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template

COPY index.html /usr/share/nginx/html/
COPY css    /usr/share/nginx/html/css
COPY js     /usr/share/nginx/html/js
COPY assets /usr/share/nginx/html/assets

EXPOSE 10000
