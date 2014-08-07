import subprocess
import json
import sys
import os

def gposttl(utterance):
    p = subprocess.Popen(['gposttl','--silent'], stdout=subprocess.PIPE, stdin=subprocess.PIPE)
    out = p.communicate(utterance)
    if len(out) > 1:
        tokens = [a.replace('\t','|') 
                  for a in out[0].split('\n') 
                  if len(a) > 0]
        return tokens
    else:
        raise Exception('#Error: no text to parse')

def tag_content(s):
    tagged_content = ' '.join(gposttl(s))
    return tagged_content


def process_file(file_loc):
    jdict = json.load(open(file_loc,'r'))
    jdict['tagged'] = tag_content(jdict['text'])
    return jdict

if __name__ == "__main__":
    output_dir = sys.argv[1]
    processed = process_file(sys.argv[2])
    output_loc = os.path.join(output_dir, processed['id'] + '.json')
    with open(output_loc, 'w') as output_file:
        json.dump(processed, output_file)
