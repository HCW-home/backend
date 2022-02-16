#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
This script is provided as helper to easily manage users by using API.
You will need to enable admin access on HUG@Home before.
"""


import argparse
from lib.lib import *

parser = argparse.ArgumentParser(description='Remove queue from a user.')
parser.add_argument('email', metavar='Email', type=str, nargs=1,
                   help='Email of the user')
parser.add_argument('queue', metavar='Queue', type=str, nargs=1,
                   help='Name of the queue')
args = parser.parse_args()


a = accounts(args.email[0])

q = queues()
n = q.returnID(args.queue[0])

if n:
    r = a.delQueue(n)
    print(str(r) + ": DELETE")
else:
    print(args.queue[0] + ": NOT FOUND")

