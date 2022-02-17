Summary: Front end for Hug@Home Backend application
Name: hcw-athome-backend
Version: 4.9.1
Release: 2
Group: Web Application
License: HUG
Source: %{name}-%{version}.tar.gz
BuildRoot: %{_tmppath}/%{name}-root
BuildRequires: nodejs = 2:12.22.10-1nodesource
Requires: nodejs = 2:12.22.10-1nodesource
BuildArch: noarch

%global __requires_exclude dtrace
%define _binaries_in_noarch_packages_terminate_build   0

%description
SPECS version 1

%prep
#%setup -c SPECS
%__rm -rf %{_topdir}/BUILD
%__cp -a %{_sourcedir} %{_topdir}/BUILD

%install
%{__make} install
%{__install} -d -m0755 %{buildroot}/%{_datadir}/%{name}/
%{__cp} -a app.js api config node_modules package.json package-lock.json public tasks views %{buildroot}/%{_datadir}/%{name}/
%{__install} -d -m0755 %{buildroot}/lib/systemd/system
%{__cp} redhat/hug-home.service %{buildroot}/lib/systemd/system
%{__install} -d -m0755 %{buildroot}/%{_sysconfdir}/hug-home/
%{__cp} redhat/hcw-backend.conf %{buildroot}/%{_sysconfdir}/hug-home/
%{__cp} redhat/nginx-common %{buildroot}/%{_sysconfdir}/hug-home/
%{__cp} redhat/nginx-proxy %{buildroot}/%{_sysconfdir}/hug-home/
%{__install} -d -m0755 %{buildroot}/%{_datadir}/doc/%{name}/
%{__cp} -a redhat/nginx/ %{buildroot}/%{_datadir}/doc/%{name}/nginx-samples/

%clean
%{__rm} -rf %{buildroot}

%files
%defattr(-,root,root, 0755)
%{_datadir}/%{name}/
%{_datadir}/doc/%{name}/
/lib/systemd/system/
%config(noreplace) %{_sysconfdir}/hug-home/

%post
## Commands to for the post install
systemctl daemon-reload
systemctl restart hug-home
adduser --system hcwhome || true

mkdir -p /var/lib/hug-home/attachments/
chown -R hcwhome /var/lib/hug-home/attachments/

%changelog
* Wed Apr 17 2019 Olivier Bitsch <olivier.b@iabsis.com>
- Initial spec file for hug-home-backend package.
