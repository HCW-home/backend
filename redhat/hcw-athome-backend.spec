Summary: Front end for Hug@Home Backend application
Name: hcw-athome-backend
Version: 5.1.0
Release: 1
Group: Web Application
License: HUG
Source: %{name}-%{version}.tar.gz
BuildRoot: %{_tmppath}/%{name}-root
BuildRequires: nodejs
Requires: nodejs
BuildArch: noarch

%global __requires_exclude dtrace
%define _binaries_in_noarch_packages_terminate_build   0
%undefine __brp_mangle_shebangs

%description
SPECS version 1

%prep
#%setup -c SPECS
%__rm -rf %{_topdir}/BUILD
%__cp -a %{_sourcedir} %{_topdir}/BUILD

%install
## Prepare node_modules
%{__make}
## Create datadir folder
%{__install} -d -m0755 %{buildroot}/%{_datadir}/hcw-athome/backend/
%{__cp} -a .sailsrc app.js api config node_modules package.json public views %{buildroot}/%{_datadir}/hcw-athome/backend/
%{__install} -d -m0755 %{buildroot}/lib/systemd/system
%{__cp} hcw-athome.service %{buildroot}/lib/systemd/system
## Create config folder
%{__install} -d -m0755 %{buildroot}/%{_sysconfdir}/hcw-athome/
%{__cp} .env.dist %{buildroot}/%{_sysconfdir}/hcw-athome/hcw-athome.conf
## Create nginx config
%{__cp} nginx/nginx-common %{buildroot}/%{_sysconfdir}/hcw-athome/
%{__cp} nginx/nginx-proxy %{buildroot}/%{_sysconfdir}/hcw-athome/
## Copy nginx sample
%{__install} -d -m0755 %{buildroot}/%{_datadir}/doc/%{name}/nginx-samples/
%{__cp} -a nginx/hcw-athome-{doctor,nurse,patient,scheduler}.conf %{buildroot}/%{_datadir}/doc/%{name}/nginx-samples/

%clean
%{__rm} -rf %{buildroot}

%files
%defattr(-,root,root, 0755)
%{_datadir}/hcw-athome/
%{_datadir}/doc/%{name}/
/lib/systemd/system/
%config(noreplace) %{_sysconfdir}/hcw-athome/

%post
## Commands to for the post install
systemctl daemon-reload
systemctl restart hcw-athome
adduser --system hcwhome || true

mkdir -p /var/lib/hcw-athome/attachments/
chown -R hcwhome /var/lib/hcw-athome/attachments/

%changelog
* Wed Apr 17 2019 Olivier Bitsch <olivier.b@iabsis.com>
- Initial spec file for hug-home-backend package.
