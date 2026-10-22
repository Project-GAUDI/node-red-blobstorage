#! /bin/bash

# Required environments
# account
# container_name
# container_path
# tagid

fullname=`readlink -f $0`
# dir=`dirname $fullname`

tagid_in_spec=""
docs_files=`find docs -name spec.md`
for file in $docs_files;
do
  match=$(sed -n '/---/{p; :loop n; p; /---/q; b loop}' $file | grep 'version:')
  tagid_in_spec=`echo ${match##*:} | tr -d '"'`
done
if [ -z $tagid_in_spec ]; then
  echo "Failed to read version from spec.md"
  exit 1
fi
if [ $tagid_in_spec != $tagid ]; then
  echo "Tag-id unmatched between input tag-id and version in spec.md's header."
  exit 1
fi

docs_files=`find docs -name release-notes.md`
for docs_file in $docs_files
do
  file_name=${docs_file##docs/}
  az storage blob upload --account-name $account --container-name $container_name --name $container_path/$file_name --file $docs_file --overwrite true
done

docs_files=`find docs -type f | grep -v release-notes.md | grep -v internal-spec.md`
for docs_file in $docs_files
do
  file_name=${docs_file##docs/}
  az storage blob upload --account-name $account --container-name $container_name --name $container_path/$tagid/$file_name --file $docs_file --overwrite true
done
