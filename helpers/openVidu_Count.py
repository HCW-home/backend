#!/usr/bin/env python3
# -*- coding: utf-8 -*-

HOSTNAME=""
PROTO="https"
LOGIN="openviduapp"
PASSWORD=""


import json, requests


class Openvidu:
    def __init__(self):
        self.url_api=PROTO + "://" + LOGIN + ":" + PASSWORD + "@" + HOSTNAME + "/api"

    def getSessions(self):
        url = self.url_api + "/sessions"
        response = requests.get(url)
        if response.status_code == 200:
            self.sessions = json.loads(response.content.decode('utf-8'))
            return self.sessions
        else:
            print("Unable to get number of session")
            return None

    def getConnection(self):
        connection = 0
        if self.sessions:
            for session in self.sessions["content"]:
                count = session["connections"]["numberOfElements"]
                print(count)
                connection = connection + count
            return connection
        else:
            print("Unable to get number of connection")
            return None
            


if __name__ == "__main__":
    openvidu = Openvidu()
    sessions = openvidu.getSessions()
    connections = openvidu.getConnection()
    if not sessions == None:
        count = sessions["numberOfElements"]
        print("OK | call=" + str(count) + " connection=" + str(connections))
    else:
        print("KO - Unable to get call")
