#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
This script is provided as helper to easily manage users by using API.
You will need to enable admin access on HUG@Home before.
"""



from lib.lib import *

csv_file_path="liste.csv"

q = queues()



a = allDoctors()
for doctor in a.returnAccountInfo():
    d = accounts(doctor["email"])
    d.getQueues()
    r = d.returnQueues()

    if len(r) > 1:
        print("WARNING :" + d["email"] + " has more than one queues:")
        for queue in r:
            print(queue["name"])




